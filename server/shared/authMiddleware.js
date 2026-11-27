const crypto = require('crypto');
const cookie = require('cookie');
const { prisma } = require('./db');
const {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  CSRF_COOKIE,
  signAccessToken,
  verifyAccessToken,
  getJwtSecret,
} = require('./tokenService');
const { sanitizeUser } = require('./validation');

function extractBearerToken(req) {
  const header = req.header('Authorization');
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    const token = header.slice(7).trim();
    if (token) return { token, source: 'bearer' };
  }
  if (req.cookies && req.cookies[ACCESS_COOKIE]) {
    return { token: req.cookies[ACCESS_COOKIE], source: 'cookie' };
  }
  return { token: null, source: null };
}

async function loadAuthenticatedUser(decoded) {
  const userId = decoded.sub || decoded._id || decoded.id;
  if (!userId) return { error: 'Invalid token payload.', status: 401 };

  const user = await prisma.user.findUnique({
    where: { id: userId },
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
  });

  if (!user || user.isDeleted) {
    return { error: 'User session is no longer valid. Please log in again.', status: 401 };
  }

  if (!user.active) {
    return { error: 'Account inactive or suspended. Please contact admin.', status: 403 };
  }

  const tokenVersion = decoded.tokenVersion ?? 0;
  if (tokenVersion !== user.tokenVersion) {
    return { error: 'Session has been revoked. Please log in again.', status: 401 };
  }

  return { user };
}

/**
 * Verifies JWT access token from HttpOnly cookie or Authorization Bearer header,
 * enforces active/non-deleted user status and tokenVersion revocation across ALL roles.
 */
async function verify(req, res, next) {
  const { token, source } = extractBearerToken(req);

  if (!token) {
    return res.status(401).json({ error: 'Access denied. Authentication required.' });
  }

  try {
    const decoded = verifyAccessToken(token);
    const { user, error, status } = await loadAuthenticatedUser(decoded);
    if (error) {
      return res.status(status).json({ error });
    }

    req.authSource = source;
    req.currentUser = sanitizeUser(user);
    req.user = {
      _id: user.id,
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name || user.username,
      role: user.role,
      tlId: user.tlId,
      adminId: user.adminId,
      receiverMail: user.receiverMail,
      tokenVersion: user.tokenVersion,
    };

    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session token.' });
  }
}

const CSRF_EXEMPT_PATHS = new Set([
  '/auth/login',
  '/auth/register',
  '/auth/forgot-password',
  '/auth/reset-password',
]);

/**
 * Double-submit CSRF protection for cookie-authenticated state-changing requests.
 * Stateless Bearer-only API requests (without auth cookies) are exempt.
 */
function csrfProtect(req, res, next) {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return next();
  }

  if (CSRF_EXEMPT_PATHS.has(req.path)) {
    return next();
  }

  const hasBearer = typeof req.header('Authorization') === 'string' && req.header('Authorization').startsWith('Bearer ');
  const hasAuthCookies = Boolean(req.cookies?.[ACCESS_COOKIE] || req.cookies?.[REFRESH_COOKIE]);

  if (hasBearer && !hasAuthCookies) {
    return next();
  }

  if (!hasAuthCookies) {
    return next();
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.header('X-CSRF-Token');

  if (!cookieToken || !headerToken || typeof cookieToken !== 'string' || typeof headerToken !== 'string') {
    return res.status(403).json({ error: 'CSRF validation failed.' });
  }

  const a = Buffer.from(cookieToken);
  const b = Buffer.from(headerToken);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).json({ error: 'CSRF validation failed.' });
  }

  return next();
}

/**
 * Role-based access control middleware.
 */
function authorize(...roles) {
  const allowedRoles = roles.length === 1 && Array.isArray(roles[0]) ? roles[0] : roles;
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Access denied. User not authenticated.' });
    }
    if (req.user.role === 'superadmin') {
      return next();
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
    }
    return next();
  };
}

/**
 * Socket.io authentication middleware supporting Bearer auth handshake or HttpOnly cookie.
 */
async function authenticateSocket(socket, next) {
  try {
    let token = socket.handshake?.auth?.token;
    if (!token && socket.handshake?.headers?.cookie) {
      const parsedCookies = cookie.parse(socket.handshake.headers.cookie);
      token = parsedCookies[ACCESS_COOKIE];
    }

    if (!token) {
      return next(new Error('Authentication required'));
    }

    const decoded = verifyAccessToken(token);
    const { user, error } = await loadAuthenticatedUser(decoded);
    if (error || !user) {
      return next(new Error(error || 'Authentication failed'));
    }

    socket.user = sanitizeUser(user);
    return next();
  } catch {
    return next(new Error('Invalid or expired session token'));
  }
}

function sign(user) {
  return signAccessToken(user);
}

module.exports = {
  sign,
  verify,
  csrfProtect,
  authorize,
  authenticateSocket,
  getJwtSecret,
};
