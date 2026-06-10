const { prisma } = require('./db');

/**
 * Resolves agent, team lead, and admin names for a batch of records
 * in a single database query, returning a mapping of user id -> user object.
 * This replaces querying the entire user database table.
 * 
 * @param {Array} records - Array of records containing assignedTo, adminId, or disposedBy fields.
 * @returns {Promise<Object>} - Object mapping userId -> User data (id, name, tlId, adminId)
 */
async function resolveUserNamesForRecords(records) {
  if (!records || !records.length) return {};

  const userIds = new Set();
  records.forEach(r => {
    if (r.assignedTo) userIds.add(r.assignedTo);
    if (r.adminId) userIds.add(r.adminId);
    if (r.disposedBy) userIds.add(r.disposedBy);
  });

  const uniqueUserIds = Array.from(userIds).filter(Boolean);
  if (uniqueUserIds.length === 0) return {};

  const users = await prisma.user.findMany({
    where: { id: { in: uniqueUserIds } },
    select: { id: true, name: true, tlId: true, adminId: true }
  });

  // Collect any referenced Team Leads (tlId) or Admins (adminId) that weren't directly in uniqueUserIds
  const additionalIds = new Set();
  users.forEach(u => {
    if (u.tlId && !userIds.has(u.tlId)) additionalIds.add(u.tlId);
    if (u.adminId && !userIds.has(u.adminId)) additionalIds.add(u.adminId);
  });

  const uniqueAdditionalIds = Array.from(additionalIds).filter(Boolean);
  if (uniqueAdditionalIds.length > 0) {
    const additionalUsers = await prisma.user.findMany({
      where: { id: { in: uniqueAdditionalIds } },
      select: { id: true, name: true, tlId: true, adminId: true }
    });
    users.push(...additionalUsers);
  }

  const userMap = {};
  users.forEach(u => {
    userMap[u.id] = u;
  });

  return userMap;
}

module.exports = {
  resolveUserNamesForRecords
};
