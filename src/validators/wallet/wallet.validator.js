'use strict';

const { z } = require('zod');
const { WALLET_PROVIDERS, WALLET_TRANSACTION_TYPES } = require('../../constants/enums');

/** 1 ILS to 1,000 ILS, in agorot */
const amountMinor = z.coerce.number().int().min(100).max(100000);

const topUpSchema = z.object({
  amountMinor,
  provider: z.enum(WALLET_PROVIDERS),
});

const payoutSchema = z.object({
  amountMinor,
  provider: z.enum(WALLET_PROVIDERS),
});

const listWalletTransactionsSchema = z.object({
  type: z.enum(WALLET_TRANSACTION_TYPES).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

module.exports = {
  topUpSchema,
  payoutSchema,
  listWalletTransactionsSchema,
};
