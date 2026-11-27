const express = require('express');
const { prisma } = require('../shared/db');
const { verify, authorize } = require('../shared/authMiddleware');
const {
  validatePasswordStrength,
  hashPassword,
  encryptSecret,
} = require('../shared/passwordService');
const {
  normalizeEmail,
  normalizeIdentifier,
  normalizeName,
  SAFE_USER_SELECT,
  sanitizeUser,
} = require('../shared/validation');

const ADMIN_ALLOWED_CREATE_ROLES = new Set(['agent', 'tl']);

function createUsersRouter(io) {
  const router = express.Router();

  // GET /api/users - scoped strictly by role and tenant
  router.get('/', verify, authorize(['superadmin', 'admin']), async (req, res) => {
    try {
      const where = { isDeleted: false };
      if (req.user.role === 'admin') {
        where.OR = [
          { id: req.user.id },
          { adminId: req.user.id },
        ];
      }

      const users = await prisma.user.findMany({
        where,
        select: {
          ...SAFE_USER_SELECT,
          smtpPassword: true, // Used only internally inside sanitizeUser -> hasSmtpPassword boolean
        },
      });

      return res.json(users.map(sanitizeUser));
    } catch (err) {
      console.error('Fetch users error:', err.message);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // GET /api/users/my-agents - TL only
  router.get('/my-agents', verify, authorize('tl'), async (req, res) => {
    try {
      const agents = await prisma.user.findMany({
        where: {
          role: 'agent',
          tlId: req.user.id,
          isDeleted: false,
        },
        select: SAFE_USER_SELECT,
      });

      return res.json(agents.map(sanitizeUser));
    } catch {
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // POST /api/users - create user (superadmin creates admin; admin creates tl/agent)
  router.post('/', verify, authorize(['superadmin', 'admin']), async (req, res) => {
    try {
      const { username, email, password, name, role, tlId, receiverMail, smtpGmail, smtpPassword } = req.body;

      const normalizedUsername = normalizeIdentifier(username || email);
      const normalizedEmail = normalizeEmail(email || (username && username.includes('@') ? username : null));
      const normalizedName = normalizeName(name);

      if (!normalizedUsername) {
        return res.status(400).json({ error: 'A valid username or email is required.' });
      }
      if (!normalizedName) {
        return res.status(400).json({ error: 'Full name must be between 2 and 100 characters.' });
      }

      if (req.user.role === 'superadmin') {
        if (role !== 'admin') {
          return res.status(403).json({ error: 'Super Admin can only create Admin users from the dashboard.' });
        }
      } else {
        if (!ADMIN_ALLOWED_CREATE_ROLES.has(role)) {
          return res.status(403).json({ error: 'Invalid role. Admins can only create Team Leads or Agents.' });
        }
      }

      const strength = validatePasswordStrength(password);
      if (!strength.valid) {
        return res.status(400).json({ error: strength.message });
      }

      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            { username: { equals: normalizedUsername, mode: 'insensitive' } },
            ...(normalizedEmail ? [{ email: { equals: normalizedEmail, mode: 'insensitive' } }] : []),
          ],
        },
        select: { id: true },
      });
      if (existingUser) {
        return res.status(409).json({ error: 'Username or email already exists.' });
      }

      const existingName = await prisma.user.findFirst({
        where: {
          name: { equals: normalizedName, mode: 'insensitive' },
          isDeleted: false,
        },
        select: { id: true },
      });
      if (existingName) {
        return res.status(409).json({ error: 'Name already exists. Please use a unique name.' });
      }

      let validTlId = null;
      if (role === 'agent' && tlId) {
        const tlUser = await prisma.user.findFirst({
          where: { id: tlId, role: 'tl', adminId: req.user.id, isDeleted: false },
          select: { id: true },
        });
        if (!tlUser) {
          return res.status(400).json({ error: 'Selected Team Lead does not belong to your organization.' });
        }
        validTlId = tlUser.id;
      }

      const passwordHash = await hashPassword(password);
      const userData = {
        username: normalizedUsername,
        email: normalizedEmail,
        passwordHash,
        name: normalizedName,
        role,
        tlId: validTlId,
        adminId: req.user.role === 'admin' ? req.user.id : null,
        active: true,
        isDeleted: false,
        passwordChangedAt: new Date(),
      };

      if (role === 'admin') {
        userData.receiverMail = receiverMail ? receiverMail.trim() : null;
        userData.smtpGmail = smtpGmail ? smtpGmail.trim() : null;
        userData.smtpPassword = smtpPassword ? encryptSecret(smtpPassword) : null;
      }

      const result = await prisma.user.create({
        data: userData,
        select: {
          ...SAFE_USER_SELECT,
          smtpPassword: true,
        },
      });

      if (io) io.emit('users_updated');
      return res.status(201).json(sanitizeUser(result));
    } catch (err) {
      if (err?.code === 'P2002') {
        return res.status(409).json({ error: 'Username or email already exists.' });
      }
      console.error('Create user error:', err.message);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // PUT /api/users/:id - strict tenant ownership check and mass-assignment prevention
  router.put('/:id', verify, authorize(['superadmin', 'admin']), async (req, res) => {
    try {
      const { name, password, active, tlId, agentAction, newTlId, reactivateAgents, receiverMail, smtpGmail, smtpPassword } = req.body;
      const userId = req.params.id;

      const existingUser = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          role: true,
          active: true,
          adminId: true,
          isDeleted: true,
        },
      });
      if (!existingUser || existingUser.isDeleted) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Enforce strict tenant isolation for Admins
      if (req.user.role === 'admin') {
        const isSelf = existingUser.id === req.user.id;
        const isManagedSubordinate = existingUser.adminId === req.user.id && ['agent', 'tl'].includes(existingUser.role);
        if (!isSelf && !isManagedSubordinate) {
          return res.status(403).json({ error: 'Access denied. You can only manage users within your organization.' });
        }
      }

      const updateData = {};
      if (name !== undefined && name !== '') {
        const normalizedName = normalizeName(name);
        if (!normalizedName) {
          return res.status(400).json({ error: 'Full name must be between 2 and 100 characters.' });
        }
        const existingName = await prisma.user.findFirst({
          where: {
            name: { equals: normalizedName, mode: 'insensitive' },
            isDeleted: false,
            id: { not: userId },
          },
          select: { id: true },
        });
        if (existingName) {
          return res.status(409).json({ error: 'Name already exists. Please use a unique name.' });
        }
        updateData.name = normalizedName;
      }

      if (active !== undefined) {
        if (userId === req.user.id && !active) {
          return res.status(400).json({ error: 'You cannot deactivate your own account.' });
        }
        updateData.active = Boolean(active);
        if (!active) {
          updateData.tokenVersion = { increment: 1 };
        }
      }

      if (tlId !== undefined && existingUser.role === 'agent') {
        if (tlId) {
          const tlWhere = { id: tlId, role: 'tl', isDeleted: false };
          if (req.user.role === 'admin') tlWhere.adminId = req.user.id;
          const tlUser = await prisma.user.findFirst({ where: tlWhere, select: { id: true } });
          if (!tlUser) {
            return res.status(400).json({ error: 'Invalid Team Lead selection.' });
          }
          updateData.tlId = tlUser.id;
        } else {
          updateData.tlId = null;
        }
      }

      let passwordWasUpdated = false;
      if (password) {
        const strength = validatePasswordStrength(password);
        if (!strength.valid) {
          return res.status(400).json({ error: strength.message });
        }
        updateData.passwordHash = await hashPassword(password);
        updateData.passwordChangedAt = new Date();
        updateData.tokenVersion = { increment: 1 };
        passwordWasUpdated = true;
      }

      if (existingUser.role === 'admin') {
        if (receiverMail !== undefined) updateData.receiverMail = receiverMail.trim() || null;
        if (smtpGmail !== undefined) updateData.smtpGmail = smtpGmail.trim() || null;
        if (smtpPassword !== undefined && String(smtpPassword).trim() !== '') {
          updateData.smtpPassword = encryptSecret(smtpPassword);
        }
      }

      if (existingUser.role === 'tl' && Boolean(active) === false && existingUser.active === true) {
        const agentsUnderTL = await prisma.user.findMany({
          where: { role: 'agent', tlId: userId, isDeleted: false },
          select: { id: true },
        });

        if (agentsUnderTL.length > 0) {
          if (agentAction === 'inactivate') {
            await prisma.user.updateMany({
              where: { role: 'agent', tlId: userId, isDeleted: false },
              data: { active: false, tokenVersion: { increment: 1 } },
            });
          } else if (agentAction === 'reassign' && newTlId) {
            const replacementWhere = { id: newTlId, role: 'tl', isDeleted: false };
            if (req.user.role === 'admin') replacementWhere.adminId = req.user.id;
            const validReplacement = await prisma.user.findFirst({ where: replacementWhere, select: { id: true } });
            if (!validReplacement) {
              return res.status(400).json({ error: 'Invalid replacement Team Lead.' });
            }
            await prisma.user.updateMany({
              where: { role: 'agent', tlId: userId, isDeleted: false },
              data: { tlId: validReplacement.id },
            });
          } else {
            return res.status(400).json({
              error: 'Disposition required',
              needsAction: true,
              agentCount: agentsUnderTL.length,
            });
          }
        }
      }

      if (existingUser.role === 'tl' && Boolean(active) === true && existingUser.active === false) {
        if (reactivateAgents === true) {
          await prisma.user.updateMany({
            where: { role: 'agent', tlId: userId, active: false, isDeleted: false },
            data: { active: true },
          });
        }
      }

      await prisma.user.update({
        where: { id: userId },
        data: updateData,
      });

      if (passwordWasUpdated || updateData.active === false) {
        await prisma.refreshToken.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      if (io) io.emit('users_updated');
      return res.json({ success: true });
    } catch (err) {
      console.error('Update user error:', err.message);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // DELETE /api/users/wipe - superadmin only
  router.delete('/wipe', verify, authorize(['superadmin']), async (req, res) => {
    try {
      await prisma.user.deleteMany({
        where: { role: { not: 'superadmin' } },
      });
      return res.json({ success: true });
    } catch (err) {
      console.error('Wipe users error:', err.message);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // DELETE /api/users/:id - superadmin only
  router.delete('/:id', verify, authorize(['superadmin']), async (req, res) => {
    try {
      const userId = req.params.id;
      if (userId === req.user.id) {
        return res.status(400).json({ error: 'Cannot delete your own superadmin account.' });
      }
      await prisma.$transaction([
        prisma.user.update({
          where: { id: userId },
          data: { isDeleted: true, active: false, tokenVersion: { increment: 1 } },
        }),
        prisma.refreshToken.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
      ]);
      if (io) io.emit('users_updated');
      return res.json({ success: true });
    } catch (err) {
      console.error('Delete user error:', err.message);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  return router;
}

module.exports = { createUsersRouter };
