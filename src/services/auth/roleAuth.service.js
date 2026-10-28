'use strict';

const bcrypt = require('bcryptjs');
const { User, DriverProfile } = require('../../models');
const roleApiError = require('../../utils/auth/roleApiError');
const { toPublicDriver } = require('../Driver/driverProfile.service');
const { toUserSummary } = require('../shared/user.service');
const { normalizePhone } = require('../../utils/auth/phone');
const { normalizeUsername } = require('../../utils/auth/username');
const { reserveAttempt, completeAttempt } = require('./authThrottle.service');
const { createRoleSession } = require('./session.service');

async function findUserByIdentifier(identifier) {
  if (identifier.phone) {
    return User.findOne({ phone: normalizePhone(identifier.phone) }).select(
      '+passwordHash'
    );
  }
  return User.findOne({
    usernameNormalized: normalizeUsername(identifier.username),
  }).select('+passwordHash');
}

function isEligibleRoleAccount(user, role) {
  return user && !user.isDeleted && user.status === 'active' && user.role === role;
}

async function hasValidRoleCredentials(user, credentials, role) {
  if (!user || !(await bcrypt.compare(credentials.password, user.passwordHash))) {
    return false;
  }
  return isEligibleRoleAccount(user, role);
}

async function loginRole(role, credentials, meta = {}) {
  const user = await findUserByIdentifier(credentials);
  const throttleKeys = [{ key: `ip:${meta.ip || 'unknown'}`, scope: 'ip' }];
  const accountKey = user ? `acct:${user._id}` : null;
  if (accountKey) {
    throttleKeys.push({ key: accountKey, scope: 'account' });
  }

  const reservations = await reserveAttempt(throttleKeys);
  let failedCredentials = !user;
  let authorizedLogin = false;
  try {
    if (!(await hasValidRoleCredentials(user, credentials, role))) {
      failedCredentials = true;
      throw roleApiError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
    }

    const profile = role === 'driver' ? await DriverProfile.findOne({ user: user._id }) : null;
    const session = await createRoleSession(user._id, role, meta);
    authorizedLogin = true;
    const sessionTokens = {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresIn: session.expiresIn,
    };
    if (role === 'driver') {
      return { ...toPublicDriver(session.user, profile), ...sessionTokens };
    }
    return { user: toUserSummary(session.user), ...sessionTokens };
  } finally {
    await completeAttempt(reservations, {
      failed: failedCredentials,
      accountKey: authorizedLogin ? accountKey : null,
    });
  }
}

module.exports = { loginRole };
