const argon2 = require('argon2');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: Math.max(19456, parseInt(process.env.ARGON2_MEMORY_COST || '65536', 10)),
  timeCost: Math.max(2, parseInt(process.env.ARGON2_TIME_COST || '3', 10)),
  parallelism: Math.max(1, parseInt(process.env.ARGON2_PARALLELISM || '1', 10)),
  hashLength: 32,
};

const COMMON_WEAK_PASSWORDS = new Set([
  'password',
  'password123',
  '12345678',
  '123456789',
  'qwerty123',
  'admin123',
  'welcome123',
  'letmein123',
  'changeme123',
]);

/**
 * Validates password complexity requirements.
 * @param {string} password
 * @returns {{ valid: boolean, message?: string }}
 */
function validatePasswordStrength(password) {
  if (typeof password !== 'string') {
    return { valid: false, message: 'Password must be a valid string.' };
  }
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long.' };
  }
  if (password.length > 128) {
    return { valid: false, message: 'Password must not exceed 128 characters.' };
  }
  if (COMMON_WEAK_PASSWORDS.has(password.toLowerCase())) {
    return { valid: false, message: 'Password is too common. Please choose a stronger password.' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must include at least one lowercase letter.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must include at least one uppercase letter.' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must include at least one number.' };
  }
  if (!/[^A-Za-z0-9\s]/.test(password)) {
    return { valid: false, message: 'Password must include at least one special character.' };
  }
  return { valid: true };
}

/**
 * Hashes a plaintext password using Argon2id with an automatic cryptographically secure random salt.
 * @param {string} plainPassword
 * @returns {Promise<string>}
 */
async function hashPassword(plainPassword) {
  if (typeof plainPassword !== 'string' || plainPassword.length === 0) {
    throw new Error('Password cannot be empty');
  }
  return argon2.hash(plainPassword, ARGON2_OPTIONS);
}

/**
 * Verifies a submitted password against a stored Argon2id (or legacy bcrypt) hash.
 * Indicates whether the stored hash should be transparently upgraded to Argon2id.
 * @param {string} plainPassword
 * @param {string} storedHash
 * @returns {Promise<{ valid: boolean, needsRehash: boolean }>}
 */
async function verifyPassword(plainPassword, storedHash) {
  if (typeof plainPassword !== 'string' || typeof storedHash !== 'string' || !storedHash) {
    return { valid: false, needsRehash: false };
  }

  if (storedHash.startsWith('$argon2')) {
    try {
      const valid = await argon2.verify(storedHash, plainPassword);
      if (!valid) return { valid: false, needsRehash: false };
      const needsRehash = !storedHash.startsWith('$argon2id$') || argon2.needsRehash(storedHash, ARGON2_OPTIONS);
      return { valid: true, needsRehash };
    } catch {
      return { valid: false, needsRehash: false };
    }
  }

  // Controlled legacy bcrypt verification -> transparent Argon2id upgrade on login
  if (/^\$2[aby]\$\d{2}\$/.test(storedHash)) {
    try {
      const valid = await bcrypt.compare(plainPassword, storedHash);
      return { valid, needsRehash: valid };
    } catch {
      return { valid: false, needsRehash: false };
    }
  }

  // Reject unhashed or unrecognized formats at runtime (handled only via controlled migration)
  return { valid: false, needsRehash: false };
}

function getSecretEncryptionKey() {
  const rawKey = process.env.SMTP_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!rawKey) return null;
  return crypto.createHash('sha256').update(String(rawKey)).digest();
}

/**
 * Encrypts sensitive outbound integration secrets (e.g., admin SMTP app password) at rest using AES-256-GCM.
 * @param {string|null} plaintext
 * @returns {string|null}
 */
function encryptSecret(plaintext) {
  if (!plaintext) return null;
  const str = String(plaintext).trim();
  if (!str) return null;
  if (str.startsWith('enc:v1:')) return str;

  const key = getSecretEncryptionKey();
  if (!key) return str;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(str, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
}

/**
 * Decrypts AES-256-GCM encrypted integration secrets, preserving compatibility with legacy plaintext values.
 * @param {string|null} stored
 * @returns {string|null}
 */
function decryptSecret(stored) {
  if (!stored) return null;
  const str = String(stored);
  if (!str.startsWith('enc:v1:')) return str;

  const key = getSecretEncryptionKey();
  if (!key) return null;

  const parts = str.split(':');
  if (parts.length !== 5) return null;

  try {
    const iv = Buffer.from(parts[2], 'base64url');
    const tag = Buffer.from(parts[3], 'base64url');
    const ciphertext = Buffer.from(parts[4], 'base64url');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

module.exports = {
  ARGON2_OPTIONS,
  validatePasswordStrength,
  hashPassword,
  verifyPassword,
  encryptSecret,
  decryptSecret,
};
