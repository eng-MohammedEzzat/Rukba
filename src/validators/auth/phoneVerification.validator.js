'use strict';

const { z } = require('../../config/zod');

const phone = z.string().trim().min(8, 'رقم الهاتف مطلوب').max(20);
const otpCode = z.string().trim().regex(/^\d{6}$/, 'رمز التحقق يتكون من 6 أرقام');

const verifyPhoneCodeSchema = z.object({ phone, code: otpCode }).strict();

module.exports = { phone, otpCode, verifyPhoneCodeSchema };
