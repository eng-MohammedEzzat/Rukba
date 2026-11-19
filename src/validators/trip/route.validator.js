'use strict';

const { z } = require('../../config/zod');
const { CURRENCIES } = require('../../constants/enums');

const objectId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'المعرّف غير صالح');

const listRoutesSchema = z.object({
  origin: z.string().trim().min(1).max(120).optional(),
  destination: z.string().trim().min(1).max(120).optional(),
});

const routeFieldsSchema = {
  origin: z.string().trim().min(1).max(120),
  destination: z.string().trim().min(1).max(120),
  defaultFareMinor: z.number().int().min(0),
  currency: z.enum(CURRENCIES),
  estimatedDurationMinutes: z.number().int().min(1),
  lineLabel: z.string().trim().min(1).max(40).nullable(),
  distanceMeters: z.number().int().min(1).nullable(),
  isActive: z.boolean(),
};

const createRoutesSchema = z
  .object({
    origin: routeFieldsSchema.origin,
    destination: routeFieldsSchema.destination,
    defaultFareMinor: routeFieldsSchema.defaultFareMinor,
    estimatedDurationMinutes: routeFieldsSchema.estimatedDurationMinutes,
    currency: routeFieldsSchema.currency.optional(),
    lineLabel: routeFieldsSchema.lineLabel.optional(),
    distanceMeters: routeFieldsSchema.distanceMeters.optional(),
    isActive: routeFieldsSchema.isActive.optional(),
  })
  .strict();

const updateRouteSchema = z
  .object({
    origin: routeFieldsSchema.origin.optional(),
    destination: routeFieldsSchema.destination.optional(),
    defaultFareMinor: routeFieldsSchema.defaultFareMinor.optional(),
    currency: routeFieldsSchema.currency.optional(),
    estimatedDurationMinutes: routeFieldsSchema.estimatedDurationMinutes.optional(),
    lineLabel: routeFieldsSchema.lineLabel.optional(),
    distanceMeters: routeFieldsSchema.distanceMeters.optional(),
    isActive: routeFieldsSchema.isActive.optional(),
  })
  .strict()
  .refine((fields) => Object.keys(fields).length > 0, 'يجب إرسال حقل واحد على الأقل للتحديث');

const adminListRoutesSchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    origin: z.string().trim().min(1).max(120).optional(),
    destination: z.string().trim().min(1).max(120).optional(),
    isActive: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
    search: z.string().trim().min(1).max(120).optional(),
  })
  .strict();
const routeParamsSchema = z
  .object({
    routeId: objectId,
  })
  .strict();

module.exports = {
  listRoutesSchema,
  adminListRoutesSchema,
  routeParamsSchema,
  createRoutesSchema,
  updateRouteSchema,
};
