'use strict';

const { z } = require('../../config/zod');

const registerSchema = z.object({
  phone: z.string().trim().min(8, 'رقم الهاتف مطلوب').max(20),
  username: z
    .string()
    .trim()
    .min(3, 'يجب أن يتكون اسم المستخدم من 3 أحرف على الأقل')
    .max(40)
    .regex(/^[a-zA-Z0-9._]+$/, 'يمكن أن يحتوي اسم المستخدم على أحرف إنجليزية وأرقام والرمزين . و _ فقط'),
  password: z.string().min(8, 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل').max(128),
  fullName: z.string().trim().max(120).optional().default(''),
});

const loginSchema = z
  .object({
    username: z.string().trim().min(3, 'يرجى إدخال اسم المستخدم').max(40),
    password: z.string().min(1, 'كلمة المرور مطلوبة').max(128),
  })
  .strict();

const refreshSchema = z.object({
  refreshToken: z.string().min(20, 'رمز التجديد مطلوب'),
});

const logoutSchema = z.object({
  refreshToken: z.string().min(20, 'رمز التجديد مطلوب'),
});

module.exports = {
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
};
