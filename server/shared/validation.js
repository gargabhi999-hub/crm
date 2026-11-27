const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function normalizeEmail(input) {
  if (typeof input !== 'string') return null;
  const normalized = input.trim().toLowerCase();
  if (!normalized || normalized.length > 254 || !EMAIL_REGEX.test(normalized)) {
    return null;
  }
  return normalized;
}

function normalizeIdentifier(input) {
  if (typeof input !== 'string') return null;
  const normalized = input.trim().toLowerCase();
  if (!normalized || normalized.length < 2 || normalized.length > 254 || /\s/.test(normalized)) {
    return null;
  }
  return normalized;
}

function normalizeName(input) {
  if (typeof input !== 'string') return null;
  const normalized = input.trim().replace(/\s+/g, ' ');
  if (normalized.length < 2 || normalized.length > 100) {
    return null;
  }
  return normalized;
}

const SAFE_USER_SELECT = {
  id: true,
  username: true,
  email: true,
  name: true,
  role: true,
  tlId: true,
  adminId: true,
  receiverMail: true,
  smtpGmail: true,
  active: true,
  isDeleted: true,
  passwordChangedAt: true,
  createdAt: true,
  updatedAt: true,
};

const SAFE_SELF_SELECT = {
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
  passwordChangedAt: true,
  createdAt: true,
};

function sanitizeUser(user) {
  if (!user) return null;
  const {
    passwordHash,
    password,
    smtpPassword,
    tokenVersion,
    failedLoginAttempts,
    lockedUntil,
    ...safe
  } = user;

  return {
    ...safe,
    _id: safe.id,
    ...(smtpPassword !== undefined ? { hasSmtpPassword: Boolean(smtpPassword) } : {}),
  };
}

function getClientIp(req) {
  const cfIp = req.headers['cf-connecting-ip'];
  if (typeof cfIp === 'string' && cfIp.trim().length > 0) {
    return cfIp.trim();
  }
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function getUserAgent(req) {
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' ? ua.slice(0, 300) : 'unknown';
}

module.exports = {
  EMAIL_REGEX,
  normalizeEmail,
  normalizeIdentifier,
  normalizeName,
  SAFE_USER_SELECT,
  SAFE_SELF_SELECT,
  sanitizeUser,
  getClientIp,
  getUserAgent,
};
