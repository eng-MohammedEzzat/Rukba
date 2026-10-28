'use strict';

const { z } = require('zod');

const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid identifier');
const positiveInt = z.string().regex(/^[1-9][0-9]*$/).transform(Number).pipe(z.number().int().safe());

const notificationListQuerySchema = z.object({
  unread: z.enum(['true', 'false']).optional().transform((unreadFlag) => unreadFlag === 'true'),
  page: positiveInt.optional().default(1),
  limit: positiveInt.pipe(z.number().max(50)).optional().default(20),
}).strict();

const notificationParamsSchema = z.object({
  notificationId: objectId,
}).strict();

module.exports = { notificationListQuerySchema, notificationParamsSchema };
