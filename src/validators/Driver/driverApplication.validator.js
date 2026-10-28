'use strict';

const { z } = require('zod');

const applicationQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

const applicationIdSchema = z.string().regex(/^[a-f\d]{24}$/i);
const applicationParamsSchema = z
  .object({ applicationId: applicationIdSchema })
  .strict();
const approveDecisionSchema = z
  .object({ decision: z.literal('approve') })
  .strict();
const rejectDecisionSchema = z
  .object({ decision: z.literal('reject'), reason: z.string().trim().min(1).max(1000) })
  .strict();
const applicationDecisionSchema = z.discriminatedUnion('decision', [
  approveDecisionSchema,
  rejectDecisionSchema,
]);

module.exports = {
  applicationQuerySchema,
  applicationParamsSchema,
  applicationDecisionSchema,
};
