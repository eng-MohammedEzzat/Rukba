'use strict';

const mongoose = require('mongoose');

const authFailureCounterSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    scope: {
      type: String,
      required: true,
      enum: ['account', 'ip'],
    },
    failCount: {
      type: Number,
      required: true,
      default: 0,
    },
    pendingCount: {
      type: Number,
      required: true,
      default: 0,
    },
    windowStartedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    lockedUntil: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

authFailureCounterSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('AuthFailureCounter', authFailureCounterSchema);
