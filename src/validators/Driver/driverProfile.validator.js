'use strict';

const { z } = require('../../config/zod');

const driverProfileUpdateSchema = z
  .object({
    fullName: z.string().trim().min(1).max(120).optional(),
    username: z
      .string()
      .trim()
      .min(3)
      .max(40)
      .regex(/^[a-zA-Z0-9._]+$/, 'يمكن أن يحتوي اسم المستخدم على أحرف إنجليزية وأرقام والرمزين . و _ فقط')
      .optional(),
  })
  .strict();

module.exports = { driverProfileUpdateSchema };
