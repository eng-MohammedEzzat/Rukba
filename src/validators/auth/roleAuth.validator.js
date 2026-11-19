'use strict';

const { z } = require('../../config/zod');

const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(40)
  .regex(/^[a-zA-Z0-9._]+$/);

const roleLoginSchema = z
  .object({
    username: usernameSchema,
    password: z.string().min(1).max(128),
  })
  .strict();

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
