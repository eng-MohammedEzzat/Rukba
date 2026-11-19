'use strict';

const crypto = require('crypto');
const env = require('../../config/env');

/** True when the code equals the fixed OTP (`FIXED_OTP_CODE`) used for phone verification and password reset. */
function isValidOtp(code) {
  const given = Buffer.from(String(code));
  const expected = Buffer.from(env.fixedOtpCode);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

module.exports = { isValidOtp };
