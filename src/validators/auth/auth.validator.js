'use strict';

const { z } = require('zod');

const registerSchema = z.object({
  phone: z.string().trim().min(8, 'phone is required').max(20),
  username: z
    .string()
    .trim()
    .min(3, 'username must be at least 3 characters')
    .max(40)
    .regex(/^[a-zA-Z0-9._]+$/, 'username may contain letters, numbers, . and _'),
  password: z.string().min(8, 'password must be at least 8 characters').max(128),
  fullName: z.string().trim().max(120).optional().default(''),
});

const loginSchema = z
  .object({
    phone: z.string().trim().min(8).max(20).optional(),
    username: z.string().trim().min(3).max(40).optional(),
    password: z.string().min(1, 'password is required').max(128),
  })
  .refine((credentials) => Boolean(credentials.phone || credentials.username), {
    message: 'Provide phone or username',
  });

const refreshSchema = z.object({
  refreshToken: z.string().min(20, 'refreshToken is required'),
});

const logoutSchema = z.object({
  refreshToken: z.string().min(20, 'refreshToken is required'),
});

module.exports = {
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
};
