const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_ISSUER = 'nexus-crm';
const JWT_AUDIENCE = 'nexus-crm-web';
const ACCESS_COOKIE = 'crm_access_token';
const REFRESH_COOKIE = 'crm_refresh_token';
const CSRF_COOKIE = 'crm_csrf';

// Ephemeral fallback ONLY for non-production local/test runs if JWT_SECRET is absent.
let ephemeralSecret = null;

function getJwtSecret() {
  const configured = process.env.JWT_SECRET;
  if (configured && configured.trim().length >= 16) {
    return configured.trim();
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: JWT_SECRET environment variable must be set (minimum 16 characters) in production.');
  }
  if (!ephemeralSecret) {
    ephemeralSecret = crypto.randomBytes(32).toString('hex');
    console.warn('⚠️ [AUTH] JWT_SECRET is missing or weak; generated an ephemeral per-process secret for development.');
  }
  return ephemeralSecret;
}

function getAccessExpiresIn() {
  return process.env.JWT_ACCESS_EXPIRES_IN || '15m';
}

function getRefreshExpiresDays() {
  const days = parseInt(process.env.JWT_REFRESH_EXPIRES_DAYS || '7', 10);
  return Number.isFinite(days) && days > 0 ? days : 7;
}

/**
 * Generates a cryptographically secure opaque token (256 bits of entropy).
 */
function generateOpaqueToken(byteLength = 32) {
  return crypto.randomBytes(byteLength).toString('base64url');
}

/**
 * Computes a deterministic SHA-256 hex digest for storing reset/refresh tokens securely at rest.
 */
function hashToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken)).digest('hex');
}

/**
 * Signs a short-lived JWT access token with strict issuer, audience, and tokenVersion claims.
 */
function signAccessToken(user) {
  const userId = user.id || user._id;
  const payload = {
    sub: userId,
    _id: userId,
    id: userId,
    username: user.username,
    email: user.email || null,
    name: user.name || user.username,
    role: user.role,
    tlId: user.tlId || null,
    adminId: user.adminId || null,
    tokenVersion: user.tokenVersion ?? 0,
  };

  return jwt.sign(payload, getJwtSecret(), {
    algorithm: 'HS256',
    expiresIn: getAccessExpiresIn(),
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    jwtid: crypto.randomUUID(),
  });
}

/**
 * Verifies a JWT access token enforcing algorithm, issuer, and audience.
 */
function verifyAccessToken(token) {
  return jwt.verify(token, getJwtSecret(), {
    algorithms: ['HS256'],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}

function getBaseCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
  };
}

function setAuthCookies(res, { accessToken, refreshToken, csrfToken }) {
  const base = getBaseCookieOptions();
  const refreshMaxAgeMs = getRefreshExpiresDays() * 24 * 60 * 60 * 1000;

  res.cookie(ACCESS_COOKIE, accessToken, {
    ...base,
    httpOnly: true,
    maxAge: 15 * 60 * 1000,
  });

  if (refreshToken) {
    res.cookie(REFRESH_COOKIE, refreshToken, {
      ...base,
      httpOnly: true,
      path: '/api/auth',
      maxAge: refreshMaxAgeMs,
    });
  }

  if (csrfToken) {
    res.cookie(CSRF_COOKIE, csrfToken, {
      ...base,
      httpOnly: false,
      maxAge: refreshMaxAgeMs,
    });
  }
}

function clearAuthCookies(res) {
  const base = getBaseCookieOptions();
  res.clearCookie(ACCESS_COOKIE, { ...base, httpOnly: true });
  res.clearCookie(REFRESH_COOKIE, { ...base, httpOnly: true, path: '/api/auth' });
  res.clearCookie(CSRF_COOKIE, { ...base, httpOnly: false });
  res.clearCookie('crm_session', { ...base, httpOnly: true });
}

module.exports = {
  JWT_ISSUER,
  JWT_AUDIENCE,
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  CSRF_COOKIE,
  getJwtSecret,
  getAccessExpiresIn,
  getRefreshExpiresDays,
  generateOpaqueToken,
  hashToken,
  signAccessToken,
  verifyAccessToken,
  setAuthCookies,
  clearAuthCookies,
};
