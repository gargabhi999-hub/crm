require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { prisma, connect } = require('../server/shared/db');
const { hashPassword } = require('../server/shared/passwordService');
const { normalizeEmail, normalizeIdentifier } = require('../server/shared/validation');

/**
 * Controlled offline migration script:
 * - Upgrades legacy bcrypt ($2a$/$2b$/$2y$) hashes or legacy unhashed rows in users.password_hash to Argon2id.
 * - Normalizes usernames/emails without logging or exposing any user password or secret.
 * - Note: Existing bcrypt hashes cannot be reversed into plaintext; this script detects unhashed legacy
 *   values if any exist and converts them to Argon2id. Bcrypt hashes are automatically upgraded to Argon2id
 *   upon each user's next successful login.
 */
async function migrateUsers() {
  await connect();
  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      email: true,
      passwordHash: true,
    },
  });

  let normalizedCount = 0;
  let migratedPlaintextCount = 0;
  let bcryptCount = 0;
  let argon2idCount = 0;

  for (const user of users) {
    const updateData = {};
    const normUsername = normalizeIdentifier(user.username);
    if (normUsername && normUsername !== user.username) {
      updateData.username = normUsername;
    }

    const inferredEmail = normalizeEmail(user.email || user.username);
    if (inferredEmail && inferredEmail !== user.email) {
      updateData.email = inferredEmail;
    }

    const stored = user.passwordHash || '';
    if (stored.startsWith('$argon2id$')) {
      argon2idCount += 1;
    } else if (/^\$2[aby]\$\d{2}\$/.test(stored)) {
      bcryptCount += 1;
    } else if (stored.length > 0) {
      updateData.passwordHash = await hashPassword(stored);
      updateData.passwordChangedAt = new Date();
      updateData.tokenVersion = { increment: 1 };
      migratedPlaintextCount += 1;
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.user.update({
        where: { id: user.id },
        data: updateData,
      });
      normalizedCount += 1;
    }
  }

  console.log('✅ Password & account security migration summary:', {
    totalUsers: users.length,
    argon2idAlready: argon2idCount,
    bcryptPendingLoginUpgrade: bcryptCount,
    plaintextUpgradedToArgon2id: migratedPlaintextCount,
    recordsUpdated: normalizedCount,
  });
}

migrateUsers()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  });
