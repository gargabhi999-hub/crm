const express = require('express');
const crypto = require('crypto');
const { prisma } = require('../shared/db');
const { verify, extractBearerToken, loadAuthenticatedUser } = require('../shared/authMiddleware');
const {
  validatePasswordStrength,
  hashPassword,
  verifyPassword,
} = require('../shared/passwordService');
const {
  REFRESH_COOKIE,
  CSRF_COOKIE,
  getRefreshExpiresDays,
  generateOpaqueToken,
  hashToken,
  signAccessToken,
  verifyAccessToken,
  setCsrfCookie,
  setAuthCookies,
  clearAuthCookies,
} = require('../shared/tokenService');
const {
  normalizeEmail,
  normalizeIdentifier,
  normalizeName,
  sanitizeUser,
  getClientIp,
  getUserAgent,
} = require('../shared/validation');
const { createRateLimiter } = require('../shared/rateLimiter');
const { sendPasswordResetEmail, sendPasswordChangedEmail } = require('../shared/mailService');
const { requireTurnstile, getTurnstileConfig } = require('../shared/cloudflareService');

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;

async function recordAuthEvent(userId, eventType, req) {
  try {
    await prisma.authAuditLog.create({
      data: {
        userId: userId || null,
        eventType,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      },
    });
  } catch {
    // Non-blocking audit log write
  }
}

async function issueSessionTokens(user, req, res, existingFamilyId = null, options = {}) {
  const { skipCookies = false } = options;
  const accessToken = signAccessToken(user);
  const rawRefreshToken = generateOpaqueToken(32);
  const refreshTokenHash = hashToken(rawRefreshToken);
  const familyId = existingFamilyId || crypto.randomUUID();
  const expiresAt = new Date(Date.now() + getRefreshExpiresDays() * 24 * 60 * 60 * 1000);
  const csrfToken = generateOpaqueToken(24);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: refreshTokenHash,
      familyId,
      expiresAt,
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    },
  });

  if (!skipCookies) {
    setAuthCookies(res, {
      accessToken,
      refreshToken: rawRefreshToken,
      csrfToken,
    });
  }

  return { accessToken, refreshToken: rawRefreshToken, csrfToken };
}

async function closeOpenWorkLogsForUser(userId) {
  try {
    const danglingSessions = await prisma.agentWorkLog.findMany({
      where: { userId, logoutAt: null },
    });
    for (const session of danglingSessions) {
      const logoutAt = new Date();
      const loginAt = new Date(session.loginAt);
      let { lunchDuration, bioDuration, teaDuration } = session;

      if (session.activeBreakType && session.activeBreakStart) {
        const breakStart = new Date(session.activeBreakStart);
        const durationSeconds = Math.max(0, Math.floor((logoutAt - breakStart) / 1000));
        if (session.activeBreakType === 'lunch') lunchDuration += durationSeconds;
        if (session.activeBreakType === 'bio') bioDuration += durationSeconds;
        if (session.activeBreakType === 'tea') teaDuration += durationSeconds;
      }

      const totalSessionTime = Math.max(0, Math.floor((logoutAt - loginAt) / 1000));
      const totalWorkTime = Math.max(0, totalSessionTime - (lunchDuration + bioDuration + teaDuration));

      await prisma.agentWorkLog.update({
        where: { id: session.id },
        data: {
          logoutAt,
          lunchDuration,
          bioDuration,
          teaDuration,
          activeBreakType: null,
          activeBreakStart: null,
          totalWorkTime,
        },
      });
    }
  } catch (err) {
    console.error('⚠️ Failed to close work log session:', err.message);
  }
}

function createAuthRouter() {
  const router = express.Router();

  const loginRateLimiter = createRateLimiter({
    keyPrefix: 'auth:login',
    windowMs: 15 * 60 * 1000,
    maxRequests: 15,
    message: 'Too many login attempts. Please wait 15 minutes and try again.',
    keyGenerator: (req) => {
      const id = normalizeIdentifier(req.body?.email || req.body?.username || req.body?.identifier || '') || 'unknown';
      return `${getClientIp(req)}:${id}`;
    },
  });

  const registerRateLimiter = createRateLimiter({
    keyPrefix: 'auth:register',
    windowMs: 15 * 60 * 1000,
    maxRequests: 10,
    message: 'Too many registration attempts. Please try again later.',
    keyGenerator: (req) => getClientIp(req),
  });

  const passwordRecoveryLimiter = createRateLimiter({
    keyPrefix: 'auth:recovery',
    windowMs: 15 * 60 * 1000,
    maxRequests: 8,
    message: 'Too many password recovery attempts. Please try again later.',
    keyGenerator: (req) => getClientIp(req),
  });

  // GET /api/auth/csrf-token - ensures a double-submit CSRF cookie exists and returns it for cross-origin frontends
  router.get('/csrf-token', (req, res) => {
    const existing = req.cookies?.[CSRF_COOKIE];
    const csrfToken = (typeof existing === 'string' && existing.length >= 16)
      ? existing
      : generateOpaqueToken(24);
    if (csrfToken !== existing) {
      setCsrfCookie(res, csrfToken);
    }
    return res.json({ csrfToken });
  });

  // GET /api/auth/cloudflare-config - non-sensitive widget configuration for frontend
  router.get('/cloudflare-config', (req, res) => {
    const cfg = getTurnstileConfig();
    return res.json({
      turnstileEnabled: cfg.enabled,
      mode: cfg.mode,
      siteKey: cfg.siteKey,
    });
  });

  // GET /api/auth/turnstile-frame - minimal WebView bridge for React Native Android & iOS apps
  router.get('/turnstile-frame', (req, res) => {
    const cfg = getTurnstileConfig();
    const safeAction = String(req.query.action || 'login').replace(/[^a-zA-Z0-9_-]/g, '');
    const siteKey = cfg.siteKey || '';
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <style>
    html, body { margin: 0; padding: 0; background: #ffffff; display: flex; justify-content: center; align-items: center; min-height: 72px; font-family: system-ui, sans-serif; }
  </style>
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script>
</head>
<body>
  <div id="cf-turnstile-box"></div>
  <script>
    function postToRN(payload) {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      }
    }
    window.addEventListener('load', function () {
      if (!window.turnstile || !${JSON.stringify(siteKey)}) {
        postToRN({ type: 'error', message: 'Turnstile unavailable' });
        return;
      }
      window.turnstile.render('#cf-turnstile-box', {
        sitekey: ${JSON.stringify(siteKey)},
        theme: 'light',
        action: ${JSON.stringify(safeAction)},
        callback: function (token) { postToRN({ type: 'verified', token: token }); },
        'expired-callback': function () { postToRN({ type: 'expired' }); },
        'error-callback': function () { postToRN({ type: 'error', message: 'Verification failed' }); }
      });
    });
  </script>
</body>
</html>`);
  });

  // POST /api/auth/register
  router.post('/register', registerRateLimiter, requireTurnstile('register'), async (req, res) => {
    try {
      const normalizedEmail = normalizeEmail(req.body?.email);
      const normalizedName = normalizeName(req.body?.name);
      const password = req.body?.password;

      if (!normalizedEmail) {
        return res.status(400).json({ error: 'A valid email address is required.' });
      }
      if (!normalizedName) {
        return res.status(400).json({ error: 'Full name must be between 2 and 100 characters.' });
      }

      const strength = validatePasswordStrength(password);
      if (!strength.valid) {
        return res.status(400).json({ error: strength.message });
      }

      const existing = await prisma.user.findFirst({
        where: {
          OR: [{ email: normalizedEmail }, { username: normalizedEmail }],
        },
        select: { id: true },
      });

      if (existing) {
        return res.status(409).json({ error: 'An account with this email already exists.' });
      }

      const passwordHash = await hashPassword(password);

      // Strictly lock self-registered role to lowest-privilege 'agent' and ignore any role/tenant/status fields in req.body
      const created = await prisma.user.create({
        data: {
          username: normalizedEmail,
          email: normalizedEmail,
          passwordHash,
          name: normalizedName,
          role: 'agent',
          tlId: null,
          adminId: null,
          active: true,
          isDeleted: false,
          passwordChangedAt: new Date(),
        },
        select: {
          id: true,
          username: true,
          email: true,
          name: true,
          role: true,
          tlId: true,
          adminId: true,
          active: true,
          createdAt: true,
        },
      });

      await recordAuthEvent(created.id, 'REGISTER', req);
      return res.status(201).json({
        message: 'Account registered successfully. Please sign in.',
        user: sanitizeUser(created),
      });
    } catch (err) {
      if (err?.code === 'P2002') {
        return res.status(409).json({ error: 'An account with this email already exists.' });
      }
      console.error('❌ [AUTH REGISTER ERROR]:', err.message);
      return res.status(500).json({ error: 'Unable to complete registration.' });
    }
  });

  // POST /api/auth/login
  router.post('/login', loginRateLimiter, requireTurnstile('login'), async (req, res) => {
    try {
      const rawIdentifier = req.body?.email || req.body?.username || req.body?.identifier;
      const password = req.body?.password;
      const identifier = normalizeIdentifier(rawIdentifier);

      if (!identifier || typeof password !== 'string' || password.length === 0) {
        return res.status(400).json({ error: 'Email/username and password are required.' });
      }

      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { email: { equals: identifier, mode: 'insensitive' } },
            { username: { equals: identifier, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          username: true,
          email: true,
          passwordHash: true,
          name: true,
          role: true,
          tlId: true,
          adminId: true,
          receiverMail: true,
          active: true,
          isDeleted: true,
          tokenVersion: true,
          failedLoginAttempts: true,
          lockedUntil: true,
          passwordChangedAt: true,
          createdAt: true,
        },
      });

      // Generic error when account does not exist or is deleted
      if (!user || user.isDeleted) {
        await recordAuthEvent(null, 'LOGIN_FAILED', req);
        return res.status(401).json({ error: 'Invalid credentials.' });
      }

      // Check temporary lockout without revealing account state differently unless locked
      if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
        await recordAuthEvent(user.id, 'LOGIN_LOCKED', req);
        return res.status(429).json({ error: 'Too many failed login attempts. Please try again later.' });
      }

      const { valid, needsRehash } = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        const nextAttempts = (user.failedLoginAttempts || 0) + 1;
        const shouldLock = nextAttempts >= MAX_FAILED_LOGIN_ATTEMPTS;
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: shouldLock ? 0 : nextAttempts,
            lockedUntil: shouldLock ? new Date(Date.now() + LOCKOUT_DURATION_MS) : null,
          },
        });
        await recordAuthEvent(user.id, 'LOGIN_FAILED', req);
        return res.status(401).json({ error: 'Invalid credentials.' });
      }

      // Check account status AFTER password verification to avoid account enumeration
      if (!user.active) {
        await recordAuthEvent(user.id, 'LOGIN_INACTIVE_REJECTED', req);
        return res.status(403).json({ error: 'Account is inactive. Please contact your administrator.' });
      }

      const updateData = {
        failedLoginAttempts: 0,
        lockedUntil: null,
      };
      if (needsRehash) {
        updateData.passwordHash = await hashPassword(password);
      }

      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: updateData,
        select: {
          id: true,
          username: true,
          email: true,
          name: true,
          role: true,
          tlId: true,
          adminId: true,
          receiverMail: true,
          active: true,
          tokenVersion: true,
          passwordChangedAt: true,
          createdAt: true,
        },
      });

      if (updatedUser.role === 'agent') {
        await closeOpenWorkLogsForUser(updatedUser.id);
        try {
          await prisma.agentWorkLog.create({
            data: {
              userId: updatedUser.id,
              loginAt: new Date(),
              lastActiveAt: new Date(),
            },
          });
        } catch (logErr) {
          console.error('⚠️ Failed to create login work log:', logErr.message);
        }
      }

      const isMobileClient = req.headers['x-client-platform'] === 'mobile' || req.body?.clientType === 'mobile';
      const { accessToken, refreshToken, csrfToken } = await issueSessionTokens(
        updatedUser,
        req,
        res,
        null,
        { skipCookies: isMobileClient }
      );
      await recordAuthEvent(updatedUser.id, 'LOGIN_SUCCESS', req);

      return res.json({
        accessToken,
        csrfToken,
        ...(isMobileClient ? { refreshToken } : {}),
        user: sanitizeUser(updatedUser),
      });
    } catch (err) {
      console.error('❌ [AUTH LOGIN ERROR]:', err.message);
      return res.status(500).json({ error: 'Authentication service temporarily unavailable.' });
    }
  });

  // POST /api/auth/refresh
  router.post('/refresh', async (req, res) => {
    try {
      const rawRefreshToken = req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken;
      if (!rawRefreshToken || typeof rawRefreshToken !== 'string') {
        clearAuthCookies(res);
        return res.status(401).json({ error: 'Refresh token missing.' });
      }

      const tokenHash = hashToken(rawRefreshToken);
      const existing = await prisma.refreshToken.findUnique({
        where: { tokenHash },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true,
              name: true,
              role: true,
              tlId: true,
              adminId: true,
              receiverMail: true,
              active: true,
              isDeleted: true,
              tokenVersion: true,
              passwordChangedAt: true,
              createdAt: true,
            },
          },
        },
      });

      if (!existing) {
        clearAuthCookies(res);
        return res.status(401).json({ error: 'Invalid refresh session.' });
      }

      // Reuse detection: if a previously rotated token is replayed, revoke the entire token family
      if (existing.revokedAt) {
        await prisma.refreshToken.updateMany({
          where: { familyId: existing.familyId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await recordAuthEvent(existing.userId, 'TOKEN_REUSE_DETECTED', req);
        clearAuthCookies(res);
        return res.status(401).json({ error: 'Session compromised or expired. Please log in again.' });
      }

      if (new Date(existing.expiresAt) <= new Date() || !existing.user || existing.user.isDeleted || !existing.user.active) {
        await prisma.refreshToken.update({
          where: { id: existing.id },
          data: { revokedAt: new Date() },
        });
        clearAuthCookies(res);
        return res.status(401).json({ error: 'Session expired. Please log in again.' });
      }

      const nextRawToken = generateOpaqueToken(32);
      const nextTokenHash = hashToken(nextRawToken);
      const accessToken = signAccessToken(existing.user);
      const csrfToken = generateOpaqueToken(24);
      const expiresAt = new Date(Date.now() + getRefreshExpiresDays() * 24 * 60 * 60 * 1000);

      await prisma.$transaction([
        prisma.refreshToken.update({
          where: { id: existing.id },
          data: {
            revokedAt: new Date(),
            replacedByTokenHash: nextTokenHash,
          },
        }),
        prisma.refreshToken.create({
          data: {
            userId: existing.user.id,
            tokenHash: nextTokenHash,
            familyId: existing.familyId,
            expiresAt,
            ipAddress: getClientIp(req),
            userAgent: getUserAgent(req),
          },
        }),
      ]);

      const isMobileClient = req.headers['x-client-platform'] === 'mobile' || req.body?.clientType === 'mobile';
      if (!isMobileClient) {
        setAuthCookies(res, { accessToken, refreshToken: nextRawToken, csrfToken });
      }

      return res.json({
        accessToken,
        csrfToken,
        ...(isMobileClient ? { refreshToken: nextRawToken } : {}),
        user: sanitizeUser(existing.user),
      });
    } catch (err) {
      console.error('❌ [AUTH REFRESH ERROR]:', err.message);
      clearAuthCookies(res);
      return res.status(401).json({ error: 'Unable to refresh session.' });
    }
  });

  // GET /api/auth/session - non-failing session bootstrap for web UI (avoids noisy 401 console errors on /login)
  router.get('/session', async (req, res) => {
    const existingCsrf = req.cookies?.[CSRF_COOKIE];
    const csrfToken = (typeof existingCsrf === 'string' && existingCsrf.length >= 16)
      ? existingCsrf
      : generateOpaqueToken(24);
    if (csrfToken !== existingCsrf) {
      setCsrfCookie(res, csrfToken);
    }

    const { token, source } = extractBearerToken(req);
    if (token) {
      try {
        const decoded = verifyAccessToken(token);
        const { user, error } = await loadAuthenticatedUser(decoded);
        if (!error && user) {
          const accessToken = source === 'cookie' ? signAccessToken(user) : token;
          return res.json({
            authenticated: true,
            user: sanitizeUser(user),
            csrfToken,
            accessToken,
          });
        }
      } catch {
        // Fall through to refresh check
      }
    }

    return res.json({
      authenticated: false,
      canRefresh: Boolean(req.cookies?.[REFRESH_COOKIE]),
      csrfToken,
    });
  });

  // GET /api/auth/me
  router.get('/me', verify, async (req, res) => {
    const existingCsrf = req.cookies?.[CSRF_COOKIE];
    const csrfToken = (typeof existingCsrf === 'string' && existingCsrf.length >= 16)
      ? existingCsrf
      : generateOpaqueToken(24);
    if (csrfToken !== existingCsrf) {
      setCsrfCookie(res, csrfToken);
    }
    const accessToken = req.authSource === 'cookie' ? signAccessToken(req.user) : undefined;
    return res.json({
      user: req.currentUser,
      csrfToken,
      ...(accessToken ? { accessToken } : {}),
    });
  });

  // POST /api/auth/logout
  router.post('/logout', async (req, res) => {
    try {
      const rawRefreshToken = req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken;
      let userId = null;

      if (rawRefreshToken && typeof rawRefreshToken === 'string') {
        const tokenHash = hashToken(rawRefreshToken);
        const tokenRow = await prisma.refreshToken.findUnique({
          where: { tokenHash },
          select: { id: true, userId: true, revokedAt: true },
        });
        if (tokenRow) {
          userId = tokenRow.userId;
          if (!tokenRow.revokedAt) {
            await prisma.refreshToken.update({
              where: { id: tokenRow.id },
              data: { revokedAt: new Date() },
            });
          }
        }
      }

      if (userId) {
        await closeOpenWorkLogsForUser(userId);
        await recordAuthEvent(userId, 'LOGOUT', req);
      }

      clearAuthCookies(res);
      return res.json({ success: true });
    } catch (err) {
      console.error('❌ [AUTH LOGOUT ERROR]:', err.message);
      clearAuthCookies(res);
      return res.json({ success: true });
    }
  });

  // POST /api/auth/logout-all
  router.post('/logout-all', verify, async (req, res) => {
    try {
      const userId = req.user.id;
      await prisma.$transaction([
        prisma.user.update({
          where: { id: userId },
          data: { tokenVersion: { increment: 1 } },
        }),
        prisma.refreshToken.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
      ]);
      await closeOpenWorkLogsForUser(userId);
      await recordAuthEvent(userId, 'LOGOUT_ALL', req);
      clearAuthCookies(res);
      return res.json({ success: true });
    } catch (err) {
      console.error('❌ [AUTH LOGOUT ALL ERROR]:', err.message);
      return res.status(500).json({ error: 'Failed to revoke all sessions.' });
    }
  });

  // POST /api/auth/forgot-password
  router.post('/forgot-password', passwordRecoveryLimiter, requireTurnstile('forgot_password'), async (req, res) => {
    const genericResponse = {
      message: 'If an account matching that email exists, a password reset link has been sent.',
    };

    try {
      const identifier = normalizeIdentifier(req.body?.email || req.body?.username);
      if (!identifier) {
        return res.status(400).json({ error: 'Please enter a valid email address.' });
      }

      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { email: { equals: identifier, mode: 'insensitive' } },
            { username: { equals: identifier, mode: 'insensitive' } },
          ],
          isDeleted: false,
          active: true,
        },
        select: {
          id: true,
          email: true,
          username: true,
          name: true,
          receiverMail: true,
        },
      });

      if (!user) {
        return res.json(genericResponse);
      }

      const destinationEmail = normalizeEmail(user.email) || normalizeEmail(user.username) || normalizeEmail(user.receiverMail);
      if (!destinationEmail) {
        return res.json(genericResponse);
      }

      const rawResetToken = generateOpaqueToken(32);
      const tokenHash = hashToken(rawResetToken);
      const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

      await prisma.$transaction([
        prisma.passwordResetToken.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: new Date() },
        }),
        prisma.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash,
            expiresAt,
          },
        }),
      ]);

      const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
      const resetUrl = `${frontendUrl}/reset-password?token=${encodeURIComponent(rawResetToken)}`;

      await sendPasswordResetEmail({
        to: destinationEmail,
        name: user.name || user.username,
        resetUrl,
      });

      await recordAuthEvent(user.id, 'PASSWORD_RESET_REQUEST', req);
      return res.json(genericResponse);
    } catch (err) {
      console.error('❌ [AUTH FORGOT PASSWORD ERROR]:', err.message);
      return res.json(genericResponse);
    }
  });

  // POST /api/auth/reset-password
  router.post('/reset-password', passwordRecoveryLimiter, requireTurnstile('reset_password'), async (req, res) => {
    try {
      const rawToken = req.body?.token;
      const newPassword = req.body?.newPassword || req.body?.password;

      if (!rawToken || typeof rawToken !== 'string') {
        return res.status(400).json({ error: 'Reset token is required.' });
      }

      const strength = validatePasswordStrength(newPassword);
      if (!strength.valid) {
        return res.status(400).json({ error: strength.message });
      }

      const tokenHash = hashToken(rawToken.trim());
      const resetRecord = await prisma.passwordResetToken.findUnique({
        where: { tokenHash },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
              name: true,
              receiverMail: true,
              active: true,
              isDeleted: true,
            },
          },
        },
      });

      if (
        !resetRecord ||
        resetRecord.usedAt !== null ||
        new Date(resetRecord.expiresAt) <= new Date() ||
        !resetRecord.user ||
        resetRecord.user.isDeleted ||
        !resetRecord.user.active
      ) {
        return res.status(400).json({ error: 'Invalid or expired password reset token.' });
      }

      const newPasswordHash = await hashPassword(newPassword);

      await prisma.$transaction([
        prisma.user.update({
          where: { id: resetRecord.userId },
          data: {
            passwordHash: newPasswordHash,
            passwordChangedAt: new Date(),
            tokenVersion: { increment: 1 },
            failedLoginAttempts: 0,
            lockedUntil: null,
          },
        }),
        prisma.passwordResetToken.update({
          where: { id: resetRecord.id },
          data: { usedAt: new Date() },
        }),
        prisma.passwordResetToken.updateMany({
          where: { userId: resetRecord.userId, usedAt: null },
          data: { usedAt: new Date() },
        }),
        prisma.refreshToken.updateMany({
          where: { userId: resetRecord.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
      ]);

      clearAuthCookies(res);
      await recordAuthEvent(resetRecord.userId, 'PASSWORD_RESET_COMPLETE', req);

      const destinationEmail =
        normalizeEmail(resetRecord.user.email) ||
        normalizeEmail(resetRecord.user.username) ||
        normalizeEmail(resetRecord.user.receiverMail);
      if (destinationEmail) {
        sendPasswordChangedEmail({
          to: destinationEmail,
          name: resetRecord.user.name || resetRecord.user.username,
        }).catch(() => {});
      }

      return res.json({ message: 'Password has been reset successfully. Please sign in with your new password.' });
    } catch (err) {
      console.error('❌ [AUTH RESET PASSWORD ERROR]:', err.message);
      return res.status(500).json({ error: 'Unable to reset password.' });
    }
  });

  // POST /api/auth/change-password
  router.post('/change-password', verify, passwordRecoveryLimiter, async (req, res) => {
    try {
      const currentPassword = req.body?.currentPassword;
      const newPassword = req.body?.newPassword;

      if (typeof currentPassword !== 'string' || !currentPassword) {
        return res.status(400).json({ error: 'Current password is required.' });
      }

      const strength = validatePasswordStrength(newPassword);
      if (!strength.valid) {
        return res.status(400).json({ error: strength.message });
      }

      if (currentPassword === newPassword) {
        return res.status(400).json({ error: 'New password must be different from your current password.' });
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
          id: true,
          username: true,
          email: true,
          name: true,
          role: true,
          tlId: true,
          adminId: true,
          receiverMail: true,
          passwordHash: true,
          tokenVersion: true,
          active: true,
          isDeleted: true,
        },
      });

      if (!user || user.isDeleted || !user.active) {
        return res.status(401).json({ error: 'Account is not active.' });
      }

      const { valid } = await verifyPassword(currentPassword, user.passwordHash);
      if (!valid) {
        await recordAuthEvent(user.id, 'PASSWORD_CHANGE_FAILED', req);
        return res.status(401).json({ error: 'Current password is incorrect.' });
      }

      const newPasswordHash = await hashPassword(newPassword);

      const [, updatedUser] = await prisma.$transaction([
        prisma.refreshToken.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
        prisma.user.update({
          where: { id: user.id },
          data: {
            passwordHash: newPasswordHash,
            passwordChangedAt: new Date(),
            tokenVersion: { increment: 1 },
          },
          select: {
            id: true,
            username: true,
            email: true,
            name: true,
            role: true,
            tlId: true,
            adminId: true,
            receiverMail: true,
            active: true,
            tokenVersion: true,
            passwordChangedAt: true,
            createdAt: true,
          },
        }),
      ]);

      const isMobileClient = req.headers['x-client-platform'] === 'mobile' || req.body?.clientType === 'mobile';
      // Issue a fresh session for the active caller while all other sessions remain invalidated
      const { accessToken, refreshToken, csrfToken } = await issueSessionTokens(
        updatedUser,
        req,
        res,
        null,
        { skipCookies: isMobileClient }
      );
      await recordAuthEvent(user.id, 'PASSWORD_CHANGED', req);

      const destinationEmail =
        normalizeEmail(updatedUser.email) ||
        normalizeEmail(updatedUser.username) ||
        normalizeEmail(updatedUser.receiverMail);
      if (destinationEmail) {
        sendPasswordChangedEmail({
          to: destinationEmail,
          name: updatedUser.name || updatedUser.username,
        }).catch(() => {});
      }

      return res.json({
        message: 'Password updated successfully.',
        accessToken,
        csrfToken,
        ...(isMobileClient ? { refreshToken } : {}),
        user: sanitizeUser(updatedUser),
      });
    } catch (err) {
      console.error('❌ [AUTH CHANGE PASSWORD ERROR]:', err.message);
      return res.status(500).json({ error: 'Failed to update password.' });
    }
  });

  return router;
}

module.exports = { createAuthRouter };
