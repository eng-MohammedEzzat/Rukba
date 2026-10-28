'use strict';

const { z } = require('zod');
const { LABEL_MAX_LENGTH, LABEL_PATTERN } = require('../../utils/trip/journeyDisplay');

const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid identifier');
const operationId = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/);
const positiveInt = z.string().regex(/^[1-9][0-9]*$/).transform(Number).pipe(z.number().int().safe());
const vehicleLabel = z.string().trim().min(1).max(LABEL_MAX_LENGTH).regex(LABEL_PATTERN);
const routeQuerySchema = z.object({
  page: positiveInt.optional().default(1),
  limit: positiveInt.pipe(z.number().max(50)).optional().default(20),
  origin: z.string().trim().min(1).max(120).optional(),
  destination: z.string().trim().min(1).max(120).optional(),
}).strict();
const createTripSchema = z.object({
  routeId: objectId,
  operationId,
  vehicleLabel: vehicleLabel.optional(),
}).strict();
const operationSchema = z.object({ operationId }).strict();
const tripParamsSchema = z.object({ tripId: objectId }).strict();

module.exports = { routeQuerySchema, createTripSchema, operationSchema, tripParamsSchema };
