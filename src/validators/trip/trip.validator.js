'use strict';

const { z } = require('zod');

const objectId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const paginationQuery = {
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
};

const discoveryPaginationQuery = {
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
};

const searchTripsSchema = z
  .object({
    routeId: objectId.optional(),
    origin: z.string().trim().min(1).max(120).optional(),
    destination: z.string().trim().min(1).max(120).optional(),
    ...discoveryPaginationQuery,
  })
  .superRefine((query, ctx) => {
    const hasRouteId = Boolean(query.routeId);
    const hasOrigin = Boolean(query.origin);
    const hasDestination = Boolean(query.destination);

    if (hasRouteId && (hasOrigin || hasDestination)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Provide routeId or origin+destination, not both',
      });
      return;
    }

    if (!hasRouteId && hasOrigin !== hasDestination) {
      ctx.addIssue({
        code: 'custom',
        message: 'Provide both origin and destination',
      });
    }
  });

const tripIdParamsSchema = z.object({
  tripId: objectId,
});

const historyTripsSchema = z.object({
  ...paginationQuery,
});

module.exports = {
  searchTripsSchema,
  tripIdParamsSchema,
  historyTripsSchema,
};
