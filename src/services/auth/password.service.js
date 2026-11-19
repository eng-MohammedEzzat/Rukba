'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { User, RefreshToken } = require('../../models');
const roleApiError = require('../../utils/auth/roleApiError');
const { runInTransaction } = require('../../utils/shared/runInTransaction');
const { toUserSummary } = require('../shared/user.service');
const {
  ensureNotificationCollection,
  recordPasswordChangedNotification,
} = require('../shared/notification.service');
const { findUserByIdentifier } = require('./roleAuth.service');
const { reserveAttempt, completeAttempt } = require('./authThrottle.service');
const { createRoleSession, withRoleFilter } = require('./session.service');
const { normalizePhone } = require('../../utils/auth/phone');
const { isValidOtp } = require('../shared/otp.service');

const RESET_CODE_TTL_MS = 15 * 60 * 1000;
const MAX_RESET_ATTEMPTS = 5;

function activeAccount(userId, role) {
  return { _id: userId, role, status: 'active', isDeleted: { $ne: true } };
}

function resetCodeHash(userId, code) {
  return crypto.createHash('sha256').update(`${userId}:${code}`).digest('hex');
}

function sameHash(left, right) {
  const a = Buffer.from(String(left), 'hex');
  const b = Buffer.from(String(right), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function invalidResetCode() {
  return roleApiError(400, 'رمز إعادة التعيين غير صالح أو منتهي الصلاحية', 'INVALID_RESET_CODE');
}

/** Sets the password, invalidates any reset code, and signs out every session in one write. */
async function replacePassword({ userId, role, passwordHash, extraFilter = {}, via }) {
  const at = new Date();
  await ensureNotificationCollection();
  return runInTransaction(async (session) => {
    const updated = await User.updateOne(
      { ...activeAccount(userId, role), ...extraFilter },
      { $set: { passwordHash, passwordReset: null }, $inc: { authRevision: 1 } },
      { session }
    );
    if (updated.matchedCount !== 1) return false;
    await RefreshToken.updateMany(
      withRoleFilter({ user: userId, revokedAt: null }, role),
      { $set: { revokedAt: at } },
      { session }
    );
    await recordPasswordChangedNotification(session, { userId, via, at });
    return true;
  });
}

async function changePassword(role, userId, { currentPassword, newPassword }, meta = {}) {
  const accountKey = `pwd-change:${userId}`;
  const reservations = await reserveAttempt([{ key: accountKey, scope: 'account' }]);
  let failed = false;
  try {
    const user = await User.findOne(activeAccount(userId, role)).select('+passwordHash');
    if (!user) {
      throw roleApiError(401, 'الحساب الحالي غير متاح.', 'INVALID_CREDENTIALS');
    }
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      failed = true;
      throw roleApiError(400, 'كلمة المرور الحالية غير صحيحة', 'INVALID_CURRENT_PASSWORD');
    }
    if (currentPassword === newPassword) {
      throw roleApiError(400, 'يجب أن تختلف كلمة المرور الجديدة عن الحالية', 'PASSWORD_UNCHANGED');
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    if (!(await replacePassword({ userId, role, passwordHash, via: 'change' }))) {
      throw roleApiError(401, 'الحساب الحالي غير متاح.', 'INVALID_CREDENTIALS');
    }
    const session = await createRoleSession(userId, role, meta);
    return {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresIn: session.expiresIn,
    };
  } finally {
    await completeAttempt(reservations, { failed, accountKey: failed ? null : accountKey });
  }
}

async function issueResetCode(adminId, driverId) {
  const code = String(crypto.randomInt(0, 100000000)).padStart(8, '0');
  const expiresAt = new Date(Date.now() + RESET_CODE_TTL_MS);
  const user = await User.findOneAndUpdate(
    activeAccount(driverId, 'driver'),
    {
      $set: {
        passwordReset: {
          codeHash: resetCodeHash(driverId, code),
          expiresAt,
          attempts: 0,
          issuedBy: adminId,
        },
      },
    },
    { returnDocument: 'after' }
  );
  if (!user) {
    throw roleApiError(404, 'السائق غير موجود أو غير مفعّل', 'DRIVER_NOT_FOUND');
  }
  return { driver: toUserSummary(user), code, expiresAt };
}

async function resetPassword(role, { phone, username, code, newPassword }, meta = {}) {
  const user = await findUserByIdentifier({ phone, username });
  const keys = [{ key: `ip:${meta.ip || 'unknown'}`, scope: 'ip' }];
  const accountKey = user ? `pwd-reset:${user._id}` : null;
  if (accountKey) keys.push({ key: accountKey, scope: 'account' });
  const reservations = await reserveAttempt(keys);
  let failed = true;
  try {
    if (!user || user.role !== role || user.status !== 'active' || user.isDeleted) {
      throw invalidResetCode();
    }
    const stored = await User.findById(user._id).select('+passwordReset');
    const reset = stored?.passwordReset;
    if (!reset || reset.expiresAt <= new Date() || reset.attempts >= MAX_RESET_ATTEMPTS) {
      throw invalidResetCode();
    }
    if (!sameHash(reset.codeHash, resetCodeHash(user._id, code))) {
      await User.updateOne(
        { _id: user._id, 'passwordReset.codeHash': reset.codeHash },
        { $inc: { 'passwordReset.attempts': 1 } }
      );
      throw invalidResetCode();
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const replaced = await replacePassword({
      userId: user._id,
      role,
      passwordHash,
      extraFilter: { 'passwordReset.codeHash': reset.codeHash },
      via: 'reset',
    });
    if (!replaced) throw invalidResetCode();
    failed = false;
    return { reset: true };
  } finally {
    await completeAttempt(reservations, { failed, accountKey: failed ? null : accountKey });
  }
}

async function findActiveRoleUserByPhone(role, phone) {
  return User.findOne({
    phone: normalizePhone(phone),
    role,
    status: 'active',
    isDeleted: { $ne: true },
  });
}

async function resetPasswordWithOtp(role, { phone, code, newPassword }, meta = {}) {
  const user = await findActiveRoleUserByPhone(role, phone);
  const keys = [{ key: `ip:${meta.ip || 'unknown'}`, scope: 'ip' }];
  const accountKey = user ? `pwd-reset:${user._id}` : null;
  if (accountKey) keys.push({ key: accountKey, scope: 'account' });
  const reservations = await reserveAttempt(keys);
  let failed = true;
  try {
    if (!user || !isValidOtp(code)) {
      throw invalidResetCode();
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    if (!(await replacePassword({ userId: user._id, role, passwordHash, via: 'reset' }))) {
      throw invalidResetCode();
    }
    failed = false;
    return { reset: true };
  } finally {
    await completeAttempt(reservations, { failed, accountKey: failed ? null : accountKey });
  }
}

module.exports = {
  changePassword,
  issueResetCode,
  resetPassword,
  resetPasswordWithOtp,
};
