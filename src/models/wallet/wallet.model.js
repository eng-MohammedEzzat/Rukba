'use strict';

const mongoose = require('mongoose');
const { WALLET_OWNER_ROLES, CURRENCIES } = require('../../constants/enums');

const walletSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      immutable: true,
    },
    ownerRole: {
      type: String,
      enum: WALLET_OWNER_ROLES,
      required: true,
      immutable: true,
    },
    balanceMinor: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: 'balanceMinor must be a safe integer (agorot)',
      },
    },
    currency: {
      type: String,
      enum: CURRENCIES,
      default: 'ILS',
      immutable: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Wallet', walletSchema);
