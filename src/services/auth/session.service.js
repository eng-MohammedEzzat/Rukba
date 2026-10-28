'use strict';

const crypto = require('crypto');
const { User, RefreshToken } = require('../../models');
const ApiError = require('../../utils/shared/ApiError');
const roleApiError = require('../../utils/auth/roleApiError');
const env = require('../../config/env');
const { runInTransaction } = require('../../utils/shared/runInTransaction');
const { createRefreshToken, hashToken, signAccessToken } = require('../../utils/auth/tokens');

function assertRoleSession(role) {
  if (!['driver', 'admin'].includes(role)) {
    throw new TypeError('Role sessions are only available for Driver and admin accounts.');
  }
}

function tokenRoleFilter(role) {
  return role === 'passenger'
    ? { $or: [{ sessionRole: 'passenger' }, { sessionRole: { $exists: false } }] }
    : { sessionRole: role };
}

function withRoleFilter(criteria, role) {
  return { $and: [criteria, tokenRoleFilter(role)] };
}

function accountFilter(userId, role, activeOnly) {
  const filter = { _id: userId, role };
  if (activeOnly) {
    filter.status = 'active';
    filter.isDeleted = { $ne: true };
  }
  return filter;
}

function writeOptions(session, extra = {}) {
  return session ? { ...extra, session } : extra;
}

function readQuery(query, session) {
  return session ? query.session(session) : query;
}

function commitRoleWrite(work) {
  return runInTransaction(work);
}

function tokenRecord(userId, refresh, role, familyId, meta) {
  return {
    user: userId,
    tokenHash: refresh.tokenHash,
    expiresAt: refresh.expiresAt,
    sessionRole: role,
    familyId,
    userAgent: meta.userAgent || null,
    ip: meta.ip || null,
  };
}

async function createRoleSession(userId, role, meta = {}) {
  assertRoleSession(role);
  const refresh = createRefreshToken();
  const familyId = crypto.randomUUID();
  const currentUser = await commitRoleWrite((session) =>
    persistRoleSession(userId, role, meta, refresh, familyId, session)
  );
  return { user: currentUser, ...tokenPair(refresh, currentUser) };
}

async function persistRoleSession(userId, role, meta, refresh, familyId, session) {
  const currentUser = await User.findOneAndUpdate(
    accountFilter(userId, role, true),
    { $inc: { authRevision: 1 } },
    writeOptions(session, { returnDocument: 'after' })
  );
  if (!currentUser) {
    throw roleApiError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
  }
  await RefreshToken.create(
    [tokenRecord(userId, refresh, role, familyId, meta)],
    writeOptions(session)
  );
  return currentUser;
}

function tokenPair(refresh, user) {
  return {
    accessToken: signAccessToken(user),
    refreshToken: refresh.raw,
    expiresIn: env.jwtAccessExpires,
  };
}

async function findRoleToken(tokenHash, role, session, now, includeRevoked = false) {
  const criteria = { tokenHash, expiresAt: { $gt: now } };
  if (!includeRevoked) {
    criteria.revokedAt = null;
  }
  return readQuery(RefreshToken.findOne(withRoleFilter(criteria, role)), session);
}

async function incrementSessionGuard(userId, role, session, activeOnly = true) {
  const guard = await User.updateOne(
    accountFilter(userId, role, activeOnly),
    { $inc: { authRevision: 1 } },
    writeOptions(session)
  );
  return guard.matchedCount === 1;
}

async function rotateRoleSession(rawToken, role, meta = {}) {
  assertRoleSession(role);
  const now = new Date();
  const nextRefresh = createRefreshToken();
  const currentUser = await commitRoleWrite((session) =>
    persistRoleRotation(rawToken, role, meta, nextRefresh, now, session)
  );
  return tokenPair(nextRefresh, currentUser);
}

async function persistRoleRotation(rawToken, role, meta, refresh, now, session) {
  const stored = await findRoleToken(hashToken(rawToken), role, session, now);
  if (!stored?.familyId) {
    throw roleApiError(401, 'Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN');
  }
  const currentUser = await activeRoleUser(stored.user, role, session);
  await consumeRefresh(stored, role, now, session);
  await RefreshToken.create(
    [successorToken(stored, refresh, role, meta)],
    writeOptions(session)
  );
  return currentUser;
}

async function activeRoleUser(userId, role, session) {
  const user = await User.findOneAndUpdate(
    accountFilter(userId, role, true),
    { $inc: { authRevision: 1 } },
    writeOptions(session, { returnDocument: 'after' })
  );
  if (!user) {
    throw roleApiError(401, 'Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN');
  }
  return user;
}

async function consumeRefresh(stored, role, now, session) {
  const consumeResult = await RefreshToken.updateOne(
    withRoleFilter({ _id: stored._id, revokedAt: null, expiresAt: { $gt: now } }, role),
    { $set: { revokedAt: now } },
    writeOptions(session)
  );
  if (consumeResult.modifiedCount !== 1) {
    throw roleApiError(401, 'Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN');
  }
}

function successorToken(stored, refresh, role, meta) {
  return {
    user: stored.user,
    tokenHash: refresh.tokenHash,
    expiresAt: refresh.expiresAt,
    sessionRole: role,
    familyId: stored.familyId,
    userAgent: meta.userAgent || null,
    ip: meta.ip || null,
  };
}

async function revokeRoleFamily(rawToken, role) {
  assertRoleSession(role);
  const now = new Date();
  await commitRoleWrite((session) => revokeFamilyInTransaction(rawToken, role, now, session));
  return { revoked: true };
}

async function revokeFamilyInTransaction(rawToken, role, now, session) {
  const stored = await findRoleToken(hashToken(rawToken), role, session, now, true);
  if (!stored?.familyId) {
    return;
  }
  if (!(await incrementSessionGuard(stored.user, role, session, false))) {
    return;
  }
  await RefreshToken.updateMany(
    withRoleFilter({ user: stored.user, familyId: stored.familyId, revokedAt: null }, role),
    { $set: { revokedAt: now } },
    writeOptions(session)
  );
}

async function revokeAllRoleSessions(userId, role) {
  assertRoleSession(role);
  const now = new Date();
  await commitRoleWrite((session) => revokeAllInTransaction(userId, role, now, session));
  return { revokedAll: true };
}

async function revokeAllInTransaction(userId, role, now, session) {
  if (!(await incrementSessionGuard(userId, role, session))) {
    throw new ApiError(401, 'Current account is unavailable.');
  }
  await RefreshToken.updateMany(
    withRoleFilter({ user: userId, revokedAt: null }, role),
    { $set: { revokedAt: now } },
    writeOptions(session)
  );
}

module.exports = {
  withRoleFilter,
  createRoleSession,
  rotateRoleSession,
  revokeRoleFamily,
  revokeAllRoleSessions,
};
