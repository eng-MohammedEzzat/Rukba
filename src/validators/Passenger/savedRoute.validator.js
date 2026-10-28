'use strict';

const { z } = require('zod');

const objectId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const saveRouteSchema = z
  .object({
    routeId: objectId,
  })
  .strict();

const listSavedRoutesSchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  })
  .strict();

const savedRouteParamsSchema = z
  .object({
    routeId: objectId,
  })
  .strict();

module.exports = {
  saveRouteSchema,
  listSavedRoutesSchema,
  savedRouteParamsSchema,
};
