'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../../config/env');

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function signAccessToken(user) {
  return jwt.sign(
    {
      sub: String(user._id),
      role: user.role,
      typ: 'access',
    },
    env.jwtAccessSecret,
    { expiresIn: env.jwtAccessExpires }
  );
}

function verifyAccessToken(token) {
  const payload = jwt.verify(token, env.jwtAccessSecret);
  if (payload.typ !== 'access') {
    const err = new Error('Invalid access token');
    err.name = 'JsonWebTokenError';
    throw err;
  }
  return payload;
}

function createRefreshToken() {
  const raw = crypto.randomBytes(48).toString('hex');
  const expiresAt = new Date(Date.now() + parseDurationMs(env.jwtRefreshExpires));
  return { raw, tokenHash: hashToken(raw), expiresAt };
}

function parseDurationMs(value) {
  const match = String(value).trim().match(/^(\d+)([smhd])$/i);
  if (!match) {
    throw new Error(
      `Invalid duration "${value}". Use formats like 15m, 7d (s|m|h|d).`
    );
  }
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return amount * multipliers[unit];
}

module.exports = {
  hashToken,
  signAccessToken,
  verifyAccessToken,
  createRefreshToken,
};
