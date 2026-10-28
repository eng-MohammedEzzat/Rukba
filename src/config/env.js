'use strict';

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function requireEnv(name) {
  const envRaw = process.env[name];
  if (!envRaw || !String(envRaw).trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return envRaw.trim();
}

function parseNonNegativeInt(raw, fallback, name) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return fallback;
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || !Number.isFinite(n)) {
    throw new Error(`${name} must be a finite non-negative integer`);
  }
  return n;
}

const DEFAULT_AVATAR =
  'https://res.cloudinary.com/demo/image/upload/w_400,h_400,c_fill,g_auto/sample.jpg';

const nodeEnv = process.env.NODE_ENV || 'development';

const env = Object.freeze({
  nodeEnv,
  port: Number(process.env.PORT) || 3000,
  mongodbUri: requireEnv('MONGODB_URI'),
  jwtAccessSecret: requireEnv('JWT_ACCESS_SECRET'),
  jwtRefreshSecret: requireEnv('JWT_REFRESH_SECRET'),
  jwtAccessExpires: process.env.JWT_ACCESS_EXPIRES || '15m',
  jwtRefreshExpires: process.env.JWT_REFRESH_EXPIRES || '7d',
  qrSecret: requireEnv('QR_SECRET'),
  qrTtlMinutes: parseNonNegativeInt(
    process.env.QR_TTL_MINUTES,
    1440,
    'QR_TTL_MINUTES'
  ),
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY || '',
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET || '',
  cloudinaryDefaultImageUrl:
    process.env.CLOUDINARY_DEFAULT_IMAGE_URL?.trim() || DEFAULT_AVATAR,
  trustProxy: String(process.env.TRUST_PROXY || 'false').toLowerCase() === 'true',
  authFailAccountMax: parseNonNegativeInt(
    process.env.AUTH_FAIL_ACCOUNT_MAX,
    5,
    'AUTH_FAIL_ACCOUNT_MAX'
  ),
  authFailAccountLockMs: parseNonNegativeInt(
    process.env.AUTH_FAIL_ACCOUNT_LOCK_MS,
    900000,
    'AUTH_FAIL_ACCOUNT_LOCK_MS'
  ),
  authFailIpMax: parseNonNegativeInt(
    process.env.AUTH_FAIL_IP_MAX,
    20,
    'AUTH_FAIL_IP_MAX'
  ),
  authFailIpLockMs: parseNonNegativeInt(
    process.env.AUTH_FAIL_IP_LOCK_MS,
    900000,
    'AUTH_FAIL_IP_LOCK_MS'
  ),
  authFailWindowMs: parseNonNegativeInt(
    process.env.AUTH_FAIL_WINDOW_MS,
    900000,
    'AUTH_FAIL_WINDOW_MS'
  ),
  defaultPhoneRegion: (process.env.DEFAULT_PHONE_REGION || 'PS').toUpperCase(),
  driverActivityBudgetMs: parseNonNegativeInt(
    process.env.DRIVER_ACTIVITY_BUDGET_MS,
    2000,
    'DRIVER_ACTIVITY_BUDGET_MS'
  ),
  driverEarningsBudgetMs: parseNonNegativeInt(
    process.env.DRIVER_EARNINGS_BUDGET_MS,
    2000,
    'DRIVER_EARNINGS_BUDGET_MS'
  ),
});

module.exports = env;
