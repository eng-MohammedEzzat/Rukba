'use strict';

const env = require('../../config/env');
const { User } = require('../../models');
const roleApiError = require('../../utils/auth/roleApiError');
const { normalizePhone } = require('../../utils/auth/phone');
const { isValidOtp } = require('../shared/otp.service');
const { reserveAttempt, completeAttempt } = require('./authThrottle.service');

function verificationNotPending() {
  return roleApiError(
    400,
    'لا يوجد حساب بانتظار تأكيد هذا الرقم',
    'PHONE_VERIFICATION_NOT_PENDING'
  );
}

function pendingAccountFilter(role, phone) {
  return { phone, role, phoneVerified: false, status: 'active', isDeleted: { $ne: true } };
}

/** Initial `phoneVerified` value for a newly self-registered account. */
function initialPhoneVerified() {
  return !env.phoneVerificationEnabled;
}

function startPhoneVerification(user) {
  return { required: !user.phoneVerified };
}

async function verifyPhone(role, { phone, code }, meta = {}) {
  const normalized = normalizePhone(phone);
  const phoneKey = `phone-verify:${normalized}`;
  const reservations = await reserveAttempt([
    { key: `ip:${meta.ip || 'unknown'}`, scope: 'ip' },
    { key: phoneKey, scope: 'account' },
  ]);
  let failed = false;
  try {
    if (!(await User.exists(pendingAccountFilter(role, normalized)))) {
      throw verificationNotPending();
    }
    if (!isValidOtp(code)) {
      failed = true;
      throw roleApiError(400, 'رمز التحقق غير صحيح', 'INVALID_VERIFICATION_CODE');
    }
    const updated = await User.updateOne(pendingAccountFilter(role, normalized), {
      $set: { phoneVerified: true },
    });
    if (updated.modifiedCount !== 1) throw verificationNotPending();
    return { phone: normalized, phoneVerified: true };
  } finally {
    await completeAttempt(reservations, { failed, accountKey: failed ? null : phoneKey });
  }
}

/** Only raise after the password matched: the phone in the details tells the client where to resend. */
function phoneNotVerifiedError(user) {
  return roleApiError(403, 'يجب تأكيد رقم الهاتف قبل تسجيل الدخول', 'PHONE_NOT_VERIFIED', {
    phone: user.phone,
  });
}

module.exports = {
  initialPhoneVerified,
  startPhoneVerification,
  verifyPhone,
  phoneNotVerifiedError,
};
