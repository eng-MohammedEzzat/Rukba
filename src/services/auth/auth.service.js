'use strict';

const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { User, RefreshToken } = require('../../models');
const ApiError = require('../../utils/shared/ApiError');
const env = require('../../config/env');
const { toPublicUser, cleanupImageBestEffort } = require('../shared/user.service');
const { uploadUserImage } = require('../../utils/shared/cloudinary');
const { normalizePhone } = require('../../utils/auth/phone');
const { normalizeUsername } = require('../../utils/auth/username');
const {
  signAccessToken,
  createRefreshToken,
  hashToken,
} = require('../../utils/auth/tokens');
const {
  reserveAttempt,
  completeAttempt,
} = require('./authThrottle.service');
const { withRoleFilter } = require('./session.service');



const issueTokenPair=async  (user, meta)=> {
  const accessToken = signAccessToken(user);
  const refresh = createRefreshToken();

  await RefreshToken.create({
    user: user._id,
    tokenHash: refresh.tokenHash,
    expiresAt: refresh.expiresAt,
    sessionRole: 'passenger',
    userAgent: meta.userAgent || null,
    ip: meta.ip || null,
  });

  return {
    accessToken,
    refreshToken: refresh.raw,
    expiresIn: env.jwtAccessExpires,
  };
}

const registerPassenger = async (input, meta, imageFile)=> {
  const { phone, username, password, fullName } = input;
  const normalizedPhone = normalizePhone(phone);
  const usernameNormalized = normalizeUsername(username);

  const existing = await User.findOne({
    $or: [{ phone: normalizedPhone }, { usernameNormalized }],
  }).select('_id phone username usernameNormalized');

  if (existing) {
    if (existing.phone === normalizedPhone) {
      throw new ApiError(409, 'Phone already registered');
    }
    throw new ApiError(409, 'Username already taken');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const userId = new mongoose.Types.ObjectId();

  let image;
  if (imageFile) {
    const uploaded = await uploadUserImage(imageFile.buffer, { userId: String(userId) });
    image = { url: uploaded.url, publicId: uploaded.publicId };
  }

  let user;
  try {
    user = await User.create({
      _id: userId,
      phone: normalizedPhone,
      username,
      usernameNormalized,
      passwordHash,
      fullName: fullName || '',
      ...(image && { image }),
      role: 'passenger',
      status: 'active',
    });
  } catch (err) {
    if (image) {
      await cleanupImageBestEffort(image.publicId);
    }
    throw err;
  }

  const tokens = await issueTokenPair(user, meta);
  return {
    user: toPublicUser(user),
    ...tokens,
  };
}

const loginPassenger= async ({ phone, username, password }, meta = {})=> {
  const ipKey = `ip:${meta.ip || 'unknown'}`;
  const restrictionKeys = [{ key: ipKey, scope: 'ip' }];

  let user = null;
  if (phone) {
    user = await User.findOne({ phone: normalizePhone(phone) }).select(
      '+passwordHash'
    );
  } else {
    user = await User.findOne({
      usernameNormalized: normalizeUsername(username),
    }).select('+passwordHash');
  }

  if (user) {
    restrictionKeys.push({ key: `acct:${user._id}`, scope: 'account' });
  }

  const reservations = await reserveAttempt(restrictionKeys);
  const accountKey = user ? `acct:${user._id}` : null;
  let failedCredentials = !user;
  let activePassenger = false;
  try {
    if (!user) {
      throw new ApiError(401, 'Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      failedCredentials = true;
      throw new ApiError(401, 'Invalid credentials');
    }

    if (user.status !== 'active') {
      throw new ApiError(403, 'Account is not active');
    }

    
    activePassenger = true;
  } finally {
    await completeAttempt(reservations, {
      failed: failedCredentials,
      accountKey: activePassenger ? accountKey : null,
    });
  }

  const tokens = await issueTokenPair(user, meta);
  return { user: toPublicUser(user), ...tokens };
}

const refreshTokens=async  (rawRefreshToken, meta)=> {
  const tokenHash = hashToken(rawRefreshToken);
  const stored = await RefreshToken.findOneAndUpdate(
    withRoleFilter(
      { tokenHash, revokedAt: null, expiresAt: { $gt: new Date() } },
      'passenger'
    ),
    { $set: { revokedAt: new Date() } },
    { returnDocument: 'before' }
  );

  if (!stored) {
    throw new ApiError(401, 'Invalid or expired refresh token');
  }

  const user = await User.findById(stored.user);
  if (
    !user ||
    user.isDeleted ||
    user.status !== 'active' ||
    user.role !== 'passenger'
  ) {
    throw new ApiError(401, 'Invalid or expired refresh token');
  }

  return issueTokenPair(user, meta);
}

const logout=async  (rawRefreshToken)=> {
  const tokenHash = hashToken(rawRefreshToken);
  await RefreshToken.deleteOne({ tokenHash });
  return { revoked: true };
}

const logoutAll=async  (userId)=> {
  await RefreshToken.updateMany(
    withRoleFilter({ user: userId, revokedAt: null }, 'passenger'),
    { $set: { revokedAt: new Date() } }
  );
  return { revokedAll: true };
}

module.exports = {
  registerPassenger,
  loginPassenger,
  refreshTokens,
  logout,
  logoutAll,
};
