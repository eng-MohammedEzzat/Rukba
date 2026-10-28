'use strict';

const { z } = require('zod');

const updateProfileSchema = z.object({
  fullName: z.string().trim().max(120).optional(),
  username: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(/^[a-zA-Z0-9._]+$/, 'username may contain letters, numbers, . and _')
    .optional(),
});

module.exports = { updateProfileSchema };
