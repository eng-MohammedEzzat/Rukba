'use strict';

const { z } = require('../../config/zod');

const qrToken = z.string()
  .min(64, 'يجب أن يتراوح طول رمز QR بين 64 و8192 حرفًا')
  .max(8192, 'يجب أن يتراوح طول رمز QR بين 64 و8192 حرفًا')
  .refine((qrTokenText) => qrTokenText === qrTokenText.trim(), 'يجب ألا يحتوي رمز QR على مسافات في بدايته أو نهايته');

const validateTicketSchema = z.object({
  qrToken,
}).strict();

const previewTicketSchema = z.object({
  qrToken,
}).strict();

module.exports = { validateTicketSchema, previewTicketSchema };
