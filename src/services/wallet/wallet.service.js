'use strict';

const env = require('../../config/env');
const { Wallet, WalletTransaction } = require('../../models');
const ApiError = require('../../utils/shared/ApiError');
const { parsePagination, paginationMeta } = require('../../utils/shared/pagination');
const { runInTransaction } = require('../../utils/shared/runInTransaction');
const simulatedProvider = require('../../utils/wallet/simulatedProvider');

const DEFAULT_CURRENCY = 'ILS';

let collectionsReady = false;

async function ensureCollection(Model) {
  try {
    await Model.createCollection();
  } catch (err) {
    if (err.code !== 48 && err.codeName !== 'NamespaceExists') throw err;
  }
  await Model.init();
}

/** Indexes must exist before any wallet write runs inside a transaction. */
async function ensureWalletCollections() {
  if (collectionsReady) return;
  await ensureCollection(Wallet);
  await ensureCollection(WalletTransaction);
  collectionsReady = true;
}

function insufficientBalance() {
  return new ApiError(409, 'Insufficient wallet balance', { code: 'INSUFFICIENT_BALANCE' });
}

function assertAmount(amountMinor) {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new ApiError(400, 'Wallet amount must be a positive integer (agorot)');
  }
}

async function recordChange(walletId, {
  userId,
  amountMinor,
  direction,
  type,
  provider = null,
  providerReference = null,
  refs = {},
  session,
}) {
  const filter = { _id: walletId };
  if (direction === 'debit') {
    filter.balanceMinor = { $gte: amountMinor };
  } else {
    filter.balanceMinor = { $lte: Number.MAX_SAFE_INTEGER - amountMinor };
  }
  const delta = direction === 'debit' ? -amountMinor : amountMinor;

  const wallet = await Wallet.findOneAndUpdate(
    filter,
    { $inc: { balanceMinor: delta } },
    { session, returnDocument: 'after' }
  );
  if (!wallet) {
    if (direction === 'debit') throw insufficientBalance();
    throw new ApiError(409, 'Wallet balance limit reached');
  }

  const [transaction] = await WalletTransaction.create(
    [{
      wallet: wallet._id,
      user: userId,
      type,
      direction,
      amountMinor,
      balanceAfterMinor: wallet.balanceMinor,
      currency: wallet.currency,
      provider,
      providerReference,
      ticket: refs.ticket ?? null,
      trip: refs.trip ?? null,
      earning: refs.earning ?? null,
    }],
    { session }
  );

  return { wallet, transaction };
}

/**
 * Creates the wallet on first use. A new passenger wallet receives the
 * configured initial balance exactly once.
 */
async function ensureWallet(userId, ownerRole, session) {
  const result = await Wallet.findOneAndUpdate(
    { user: userId },
    {
      $setOnInsert: {
        user: userId,
        ownerRole,
        balanceMinor: 0,
        currency: DEFAULT_CURRENCY,
      },
    },
    { upsert: true, returnDocument: 'after', includeResultMetadata: true, session }
  );
  const wallet = result.value;
  const inserted = Boolean(result.lastErrorObject?.upserted);

  if (inserted && ownerRole === 'passenger' && env.walletInitialBalanceMinor > 0) {
    const credited = await recordChange(wallet._id, {
      userId,
      amountMinor: env.walletInitialBalanceMinor,
      direction: 'credit',
      type: 'initial_balance',
      session,
    });
    return credited.wallet;
  }
  return wallet;
}

async function applyChange(direction, { userId, ownerRole, amountMinor, session, ...rest }) {
  assertAmount(amountMinor);
  const wallet = await ensureWallet(userId, ownerRole, session);
  return recordChange(wallet._id, { userId, amountMinor, direction, session, ...rest });
}

function credit(params) {
  return applyChange('credit', params);
}

function debit(params) {
  return applyChange('debit', params);
}

function toPublicWallet(wallet) {
  return {
    id: wallet._id,
    ownerRole: wallet.ownerRole,
    balanceMinor: wallet.balanceMinor,
    currency: wallet.currency,
    updatedAt: wallet.updatedAt,
  };
}

function toPublicWalletTransaction(transaction) {
  return {
    id: transaction._id,
    type: transaction.type,
    direction: transaction.direction,
    amountMinor: transaction.amountMinor,
    balanceAfterMinor: transaction.balanceAfterMinor,
    currency: transaction.currency,
    provider: transaction.provider ?? null,
    providerReference: transaction.providerReference ?? null,
    ticketId: transaction.ticket ?? null,
    tripId: transaction.trip ?? null,
    createdAt: transaction.createdAt,
  };
}

async function loadWallet(userId, ownerRole) {
  await ensureWalletCollections();
  return runInTransaction((session) => ensureWallet(userId, ownerRole, session));
}

async function getWallet(userId, ownerRole) {
  const wallet = await loadWallet(userId, ownerRole);
  return { wallet: toPublicWallet(wallet) };
}

async function assertSufficientBalance(userId, ownerRole, amountMinor) {
  const wallet = await loadWallet(userId, ownerRole);
  if (wallet.balanceMinor < amountMinor) {
    throw insufficientBalance();
  }
}

async function listTransactions(userId, query = {}) {
  await ensureWalletCollections();
  const pagination = parsePagination(query);
  const filter = { user: userId };
  if (query.type) {
    filter.type = query.type;
  }

  const [total, rows] = await Promise.all([
    WalletTransaction.countDocuments(filter),
    WalletTransaction.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
  ]);

  return {
    transactions: rows.map(toPublicWalletTransaction),
    meta: paginationMeta({ ...pagination, total }),
  };
}

async function topUp(passenger, { amountMinor, provider }) {
  await ensureWalletCollections();
  const result = await runInTransaction(async (session) => {
    const collected = simulatedProvider.collect({ provider, amountMinor });
    return credit({
      userId: passenger._id,
      ownerRole: 'passenger',
      amountMinor,
      type: 'top_up',
      provider,
      providerReference: collected.providerReference,
      session,
    });
  });
  return {
    wallet: toPublicWallet(result.wallet),
    transaction: toPublicWalletTransaction(result.transaction),
  };
}

async function requestPayout(driver, { amountMinor, provider }) {
  await ensureWalletCollections();
  const result = await runInTransaction(async (session) => {
    const disbursed = simulatedProvider.disburse({ provider, amountMinor });
    return debit({
      userId: driver._id,
      ownerRole: 'driver',
      amountMinor,
      type: 'payout',
      provider,
      providerReference: disbursed.providerReference,
      session,
    });
  });
  return {
    wallet: toPublicWallet(result.wallet),
    transaction: toPublicWalletTransaction(result.transaction),
  };
}

module.exports = {
  ensureWalletCollections,
  ensureWallet,
  credit,
  debit,
  getWallet,
  assertSufficientBalance,
  listTransactions,
  topUp,
  requestPayout,
  toPublicWallet,
  toPublicWalletTransaction,
};
