'use strict';

const mongoose = require('mongoose');
const {
  WALLET_TRANSACTION_TYPES,
  WALLET_DIRECTIONS,
  WALLET_PROVIDERS,
  CURRENCIES,
} = require('../../constants/enums');

const optionalRef = (ref) => ({
  type: mongoose.Schema.Types.ObjectId,
  ref,
  default: null,
  immutable: true,
});

const walletTransactionSchema = new mongoose.Schema(
  {
    wallet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet',
      required: true,
      immutable: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
    type: {
      type: String,
      enum: WALLET_TRANSACTION_TYPES,
      required: true,
      immutable: true,
    },
    direction: {
      type: String,
      enum: WALLET_DIRECTIONS,
      required: true,
      immutable: true,
    },
    amountMinor: {
      type: Number,
      required: true,
      min: 1,
      immutable: true,
      validate: {
        validator: Number.isSafeInteger,
        message: 'amountMinor must be a positive safe integer (agorot)',
      },
    },
    balanceAfterMinor: {
      type: Number,
      required: true,
      min: 0,
      immutable: true,
      validate: {
        validator: Number.isSafeInteger,
        message: 'balanceAfterMinor must be a safe integer (agorot)',
      },
    },
    currency: {
      type: String,
      enum: CURRENCIES,
      required: true,
      immutable: true,
    },
    provider: {
      type: String,
      enum: [...WALLET_PROVIDERS, null],
      default: null,
      immutable: true,
    },
    providerReference: {
      type: String,
      default: null,
      immutable: true,
    },
    ticket: optionalRef('Ticket'),
    trip: optionalRef('Trip'),
    earning: optionalRef('Earning'),
  },
  { timestamps: true }
);

walletTransactionSchema.index({ user: 1, createdAt: -1, _id: -1 });
walletTransactionSchema.index({ user: 1, type: 1, createdAt: -1, _id: -1 });
walletTransactionSchema.index(
  { ticket: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: { type: { $in: ['ticket_payment', 'ticket_refund'] } },
  }
);
walletTransactionSchema.index(
  { trip: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: { type: 'trip_earning' },
  }
);
walletTransactionSchema.index(
  { user: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: { type: 'initial_balance' },
  }
);

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);
