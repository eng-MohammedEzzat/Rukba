'use strict';

const { z } = require('zod');

const phoneSchema = z.string().trim().min(8).max(20);
const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(40)
  .regex(/^[a-zA-Z0-9._]+$/);

const roleLoginSchema = z
  .object({
    phone: phoneSchema.optional(),
    username: usernameSchema.optional(),
    password: z.string().min(1).max(128),
  })
  .strict()
  .refine((credentials) => Boolean(credentials.phone) !== Boolean(credentials.username), {
    message: 'Provide exactly one phone or username.',
  });

const roleRefreshSchema = z
  .object({ refreshToken: z.string().min(20).max(1024) })
  .strict();

const roleLogoutSchema = z
  .object({ refreshToken: z.string().min(20).max(1024) })
  .strict();

const roleLogoutAllSchema = z.object({}).strict();

module.exports = {
  roleLoginSchema,
  roleRefreshSchema,
  roleLogoutSchema,
  roleLogoutAllSchema,
};
