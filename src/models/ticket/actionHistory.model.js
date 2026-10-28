'use strict';

const mongoose = require('mongoose');
const {
  ACTION_TYPES,
  ROLES,
  SCAN_RESULTS,
  CURRENCIES,
  PAYMENT_STATUSES,
} = require('../../constants/enums');

const scanLocationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
    coordinates: {
      type: [Number],
    },
  },
  { _id: false }
);

const scanSchema = new mongoose.Schema(
  {
    result: {
      type: String,
      enum: SCAN_RESULTS,
      required: true,
    },
    device: {
      type: String,
      trim: true,
      default: null,
    },
    location: {
      type: scanLocationSchema,
      default: undefined,
    },
    syncedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

const validationResultSchema = new mongoose.Schema(
  {
    passengerDisplayName: { type: String, trim: true, required: true },
    ticketId: { type: String, trim: true, required: true },
    tripId: { type: String, trim: true, required: true },
    usedAt: { type: Date, required: true },
    ticketCode: { type: String, trim: true, uppercase: true, default: null },
    origin: { type: String, trim: true, default: null },
    destination: { type: String, trim: true, default: null },
    lineLabel: { type: String, trim: true, default: null },
    vehicleLabel: { type: String, trim: true, default: null },
    fareMinor: {
      type: Number,
      min: 0,
      default: null,
      validate: {
        validator(value) {
          return value === null || value === undefined || Number.isInteger(value);
        },
        message: 'fareMinor must be an integer (agorot)',
      },
    },
    currency: {
      type: String,
      default: null,
    },
  },
  { _id: false }
);

const receiptSchema = new mongoose.Schema(
  {
    ticketCode: { type: String, trim: true, uppercase: true, default: null },
    origin: { type: String, trim: true, default: null },
    destination: { type: String, trim: true, default: null },
    fareMinor: {
      type: Number,
      min: 0,
      default: null,
      validate: {
        validator(value) {
          return value === null || value === undefined || Number.isInteger(value);
        },
        message: 'fareMinor must be an integer (agorot)',
      },
    },
    currency: {
      type: String,
      enum: CURRENCIES,
      default: 'ILS',
    },
    passengerName: { type: String, trim: true, default: null },
    passengerPhone: { type: String, trim: true, default: null },
    driverName: { type: String, trim: true, default: null },
    lineLabel: { type: String, trim: true, default: null },
    vehicleLabel: { type: String, trim: true, default: null },
    paymentStatus: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: undefined,
    },
    scannedAt: { type: Date, default: null },
    scanResult: {
      type: String,
      enum: SCAN_RESULTS,
      default: undefined,
    },
  },
  { _id: false }
);

const actionHistorySchema = new mongoose.Schema(
  {
    actionType: {
      type: String,
      enum: ACTION_TYPES,
      required: true,
    },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    actorRole: {
      type: String,
      enum: ROLES,
      required: true,
    },
    ticket: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ticket',
      default: null,
    },
    trip: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Trip',
      default: null,
    },
    operationId: {
      type: String, trim: true, default: null, maxlength: 128,
      match: /^[A-Za-z0-9._:-]+$/,
    },
    resultingStatus: {
      type: String, enum: ['boarding', 'withdrawn', 'in_progress', 'completed', 'used', null],
      default: null,
    },
    validationResult: {
      type: validationResultSchema,
      default: undefined,
    },
    inputFingerprint: { type: String, default: null, match: /^[a-f0-9]{64}$/ },
    scan: {
      type: scanSchema,
      default: undefined,
    },
    receiptCode: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },
    receipt: {
      type: receiptSchema,
      default: undefined,
    },
    occurredAt: {
      type: Date,
      default: Date.now,
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
    },
  },
  { timestamps: true }
);

actionHistorySchema.index(
  { receiptCode: 1 },
  {
    unique: true,
    partialFilterExpression: { receiptCode: { $type: 'string' } },
  }
);
actionHistorySchema.index({ actor: 1, occurredAt: -1 });
actionHistorySchema.index({ ticket: 1, occurredAt: -1 });
actionHistorySchema.index({ trip: 1, occurredAt: -1 });
actionHistorySchema.index({ actionType: 1, occurredAt: -1 });
actionHistorySchema.index({ actionType: 1, trip: 1, occurredAt: -1 });
actionHistorySchema.index(
  { actor: 1, operationId: 1 },
  { unique: true, partialFilterExpression: { operationId: { $type: 'string' } } }
);
actionHistorySchema.index(
  { trip: 1, actionType: 1 },
  { unique: true, partialFilterExpression: { actionType: { $in: ['trip_created', 'trip_withdrawn', 'trip_started', 'trip_completed'] } } }
);
actionHistorySchema.index(
  { ticket: 1, actionType: 1 },
  {
    unique: true,
    partialFilterExpression: { actionType: 'ticket_used', ticket: { $type: 'objectId' } },
  }
);
actionHistorySchema.pre('validate', function validateDriverEvent() {
  if (this.actionType?.startsWith('trip_')) {
    if (this.actorRole !== 'driver' || !this.trip || !this.operationId || !this.resultingStatus || !this.inputFingerprint) {
      throw new Error('Driver trip events require actor, trip, operationId, resultingStatus, and inputFingerprint');
    }
  }
  if (this.actionType === 'ticket_used') {
    const name = this.validationResult?.passengerDisplayName?.trim();
    if (
      this.actorRole !== 'driver' || !this.ticket || !this.trip || !this.operationId ||
      !this.inputFingerprint || this.resultingStatus !== 'used' || !name ||
      !this.validationResult?.ticketId || !this.validationResult?.tripId || !this.validationResult?.usedAt
    ) {
      throw new Error('ticket_used events require Driver actor, Ticket, Trip, operation evidence, and a typed result');
    }
    if (this.scan || this.receipt || this.receiptCode || this.meta) {
      throw new Error('ticket_used events cannot store scan, receipt, or untyped meta fields');
    }
  }
});

module.exports = mongoose.model('ActionHistory', actionHistorySchema);
