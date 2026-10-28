'use strict';

const { z } = require('zod');

const driverRegistrationSchema = z
  .object({
    phone: z.string().trim().min(8).max(20),
    username: z
      .string()
      .trim()
      .min(3)
      .max(40)
      .regex(/^[a-zA-Z0-9._]+$/),
    password: z.string().min(8).max(128),
    fullName: z.string().trim().min(1).max(120),
    identificationNumber: z.string().trim().min(1).max(10),
    licenseNumber: z.string().trim().min(1).max(64),
    vehicleDescription: z.string().trim().min(1).max(240),
  })
  .strict();

module.exports = { driverRegistrationSchema };
