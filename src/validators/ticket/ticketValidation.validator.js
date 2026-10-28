'use strict';

const { z } = require('zod');

const qrToken = z.string()
  .min(64, 'QR token must be 64-8192 characters')
  .max(8192, 'QR token must be 64-8192 characters')
  .refine((qrTokenText) => qrTokenText === qrTokenText.trim(), 'QR token must not have surrounding whitespace');

const validateTicketSchema = z.object({
  qrToken,
}).strict();

const previewTicketSchema = z.object({
  qrToken,
}).strict();

module.exports = { validateTicketSchema, previewTicketSchema };
