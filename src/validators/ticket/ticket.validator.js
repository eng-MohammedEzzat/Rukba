'use strict';

const { z } = require('zod');
const { TICKET_STATUSES } = require('../../constants/enums');

const objectId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const bookTicketSchema = z.object({
  routeId: objectId,
});

const listTicketsSchema = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  ticketCode: z
    .string()
    .trim()
    .min(1)
    .transform((ticketCode) => ticketCode.toUpperCase())
    .optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const ticketIdParamsSchema = z.object({
  ticketId: objectId,
});

module.exports = {
  bookTicketSchema,
  listTicketsSchema,
  ticketIdParamsSchema,
};
