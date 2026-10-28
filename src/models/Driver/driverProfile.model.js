'use strict';

const mongoose = require('mongoose');
const { VERIFICATION_STATUSES } = require('../../constants/enums');

const payoutStubSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    method: { type: String, default: null },
    details: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false }
);

const submissionSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    username: { type: String, required: true, trim: true, maxlength: 40 },
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    licenseNumber: { type: String, required: true, trim: true, maxlength: 100 },
    vehicleDescription: { type: String, required: true, trim: true, maxlength: 500 },
  },
  { _id: false }
);

const decisionSchema = new mongoose.Schema(
  {
    outcome: { type: String, enum: ['approved', 'rejected'], required: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reviewedAt: { type: Date, required: true },
    rejectionReason: { type: String, trim: true, default: null, maxlength: 1000 },
  },
  { _id: false }
);

decisionSchema.path('rejectionReason').validate(function validateDecisionReason(reason) {
  if (this.outcome === 'approved') {
    return reason === null;
  }
  return typeof reason === 'string' && reason.trim().length >= 1 && reason.trim().length <= 1000;
}, 'Rejection decisions require a reason; approval decisions cannot include one.');

const driverProfileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    licenseNumber: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    identificationNumber: {
      type: String,
      required: true,
      trim: true,
      maxlength: 10,
    },
    vehicleDescription: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    verificationStatus: {
      type: String,
      enum: VERIFICATION_STATUSES,
      default: 'pending',
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    applicationSource: {
      type: String,
      enum: ['signup', 'legacy'],
      default: 'legacy',
      immutable: true,
    },
    submittedAt: {
      type: Date,
      default: null,
      immutable: true,
    },
    submission: {
      type: submissionSchema,
      default: undefined,
      immutable: true,
    },
    decision: {
      type: decisionSchema,
      default: null,
    },
    snapshotBackfilledAt: {
      type: Date,
      default: null,
    },
    payout: {
      type: payoutStubSchema,
      default: () => ({ enabled: false, method: null, details: null }),
    },
    ratingAvg: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    ratingCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalTrips: {
      type: Number,
      default: 0,
      min: 0,
      validate: { validator: Number.isSafeInteger, message: 'totalTrips must be a safe integer' },
    },
  },
  { timestamps: true }
);

driverProfileSchema.index({ verificationStatus: 1, submittedAt: 1, _id: 1 });

module.exports = mongoose.model('DriverProfile', driverProfileSchema);
