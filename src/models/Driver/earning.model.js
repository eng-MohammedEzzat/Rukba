'use strict';

const mongoose = require('mongoose');
const { EARNING_STATUSES, CURRENCIES } = require('../../constants/enums');

const PERIOD_KEY = /^[0-9]{4}-(0[1-9]|1[0-2])$/;
const POLICY_VERSIONS = Object.freeze(['driver-earnings-v1']);
const TRIGGERS = Object.freeze(['trip_completed']);
const PAYMENT_TREATMENTS = Object.freeze(['used_regardless_of_unpaid_or_waived']);

function safeNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

const safeIntegerField = {
  type: Number,
  required: true,
  min: 0,
  immutable: true,
  validate: {
    validator: safeNonNegativeInteger,
    message: 'must be a non-negative safe integer',
  },
};

const snapshotText = {
  type: String,
  required: true,
  trim: true,
  minlength: 1,
  immutable: true,
};

const earningSchema = new mongoose.Schema(
  {
    trip: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Trip',
      required: true,
      unique: true,
      immutable: true,
    },
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
    routeOrigin: snapshotText,
    routeDestination: snapshotText,
    currency: {
      type: String,
      enum: CURRENCIES,
      required: true,
      immutable: true,
    },
    ticketCount: {
      ...safeIntegerField,
    },
    grossMinor: { ...safeIntegerField },
    platformFeeMinor: { ...safeIntegerField },
    netMinor: { ...safeIntegerField },
    feeBasisPoints: { ...safeIntegerField },
    status: {
      type: String,
      enum: EARNING_STATUSES,
      required: true,
    },
    accruedAt: {
      type: Date,
      required: true,
      immutable: true,
    },
    periodKey: {
      type: String,
      required: true,
      trim: true,
      immutable: true,
      validate: {
        validator: (value) => PERIOD_KEY.test(value),
        message: 'periodKey must be YYYY-MM',
      },
    },
    policyVersion: {
      type: String,
      enum: POLICY_VERSIONS,
      required: true,
      immutable: true,
    },
    trigger: {
      type: String,
      enum: TRIGGERS,
      required: true,
      immutable: true,
    },
    paymentTreatment: {
      type: String,
      enum: PAYMENT_TREATMENTS,
      required: true,
      immutable: true,
    },
    payout: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
    },
  },
  { timestamps: true }
);

earningSchema.index({ driver: 1, periodKey: 1 });
earningSchema.index({ driver: 1, periodKey: 1, accruedAt: -1, _id: -1 });
earningSchema.index({ driver: 1, periodKey: 1, status: 1, accruedAt: -1, _id: -1 });
earningSchema.index({ driver: 1, accruedAt: -1, _id: -1 });

earningSchema.pre('validate', function enforcePolicyRelationships() {
  if (this.policyVersion === 'driver-earnings-v1') {
    if (this.platformFeeMinor !== 0 || this.feeBasisPoints !== 0 || this.netMinor !== this.grossMinor) {
      throw new Error('driver-earnings-v1 requires zero fee and net equal to gross');
    }
  }
  if (
    Number.isSafeInteger(this.grossMinor)
    && Number.isSafeInteger(this.platformFeeMinor)
    && Number.isSafeInteger(this.netMinor)
    && this.grossMinor !== this.platformFeeMinor + this.netMinor
  ) {
    throw new Error('grossMinor must equal platformFeeMinor plus netMinor');
  }
});

module.exports = mongoose.model('Earning', earningSchema);
