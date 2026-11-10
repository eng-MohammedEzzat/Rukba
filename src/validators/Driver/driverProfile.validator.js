'use strict';

const { z } = require('../../config/zod');

const driverProfileUpdateSchema = z
  .object({ fullName: z.string().trim().min(1).max(120) })
  .strict();

module.exports = { driverProfileUpdateSchema };
