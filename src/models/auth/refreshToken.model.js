'use strict';

const mongoose = require('mongoose');

const refreshTokenSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    sessionRole: {
      type: String,
      enum: ['passenger', 'driver', 'admin'],
      immutable: true,
      default: undefined,
    },
    familyId: {
      type: String,
      trim: true,
      immutable: true,
      default: undefined,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    userAgent: {
      type: String,
      trim: true,
      default: null,
    },
    ip: {
      type: String,
      trim: true,
      default: null,
    },
  },
  { timestamps: true }
);

refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
refreshTokenSchema.index({ user: 1, familyId: 1, revokedAt: 1 });

refreshTokenSchema.pre('validate', function requireRoleFamily() {
  if (['driver', 'admin'].includes(this.sessionRole) && !this.familyId) {
    this.invalidate('familyId', 'Driver and admin refresh tokens require a family ID.');
  }
});

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
