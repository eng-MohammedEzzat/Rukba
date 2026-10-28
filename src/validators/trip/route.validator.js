'use strict';

const { z } = require('zod');

const objectId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const listRoutesSchema = z.object({
  origin: z.string().trim().min(1).max(120).optional(),
  destination: z.string().trim().min(1).max(120).optional(),
});
const createRoutesSchema = z.object({
  origin: z.string().trim().min(1).max(120).optional(),
  destination: z.string().trim().min(1).max(120).optional(),
  defaultFareMinor: z.number().int().min(0).optional(),
  estimatedDurationMinutes: z.number().int().min(0).optional(),
});
const routeParamsSchema = z
  .object({
    routeId: objectId,
  })
  .strict();

module.exports = { listRoutesSchema, routeParamsSchema,createRoutesSchema };
