'use strict';

const { z } = require('../../config/zod');
const { phone, otpCode } = require('./phoneVerification.validator');

const newPassword = z.string().min(8, 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل').max(128);

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'كلمة المرور الحالية مطلوبة').max(128),
    newPassword,
  })
  .strict();

const resetPasswordSchema = z
  .object({
    phone: z.string().trim().min(8).max(20).optional(),
    username: z.string().trim().min(3).max(40).optional(),
    code: z.string().trim().regex(/^\d{8}$/, 'رمز إعادة التعيين يتكون من 8 أرقام'),
    newPassword,
  })
  .strict()
  .refine((input) => Boolean(input.phone) !== Boolean(input.username), {
    message: 'يرجى إدخال رقم الهاتف أو اسم المستخدم',
  });

const driverParamsSchema = z
  .object({ driverId: z.string().regex(/^[a-f\d]{24}$/i, 'المعرّف غير صالح') })
  .strict();

const otpResetPasswordSchema = z.object({ phone, code: otpCode, newPassword }).strict();

module.exports = {
  changePasswordSchema,
  resetPasswordSchema,
  driverParamsSchema,
  otpResetPasswordSchema,
};
