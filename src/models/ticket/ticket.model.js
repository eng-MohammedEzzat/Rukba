'use strict';

const mongoose = require('mongoose');
const {
  TICKET_STATUSES,
  PAYMENT_STATUSES,
  CURRENCIES,
} = require('../../constants/enums');

/**
 * Details embedded in the passenger QR (signed as JWT at issue/refresh).
 * tokenHash stores SHA-256 of the signed token — not the raw JWT.
 */
const qrPayloadSchema = new mongoose.Schema(
  {
    ticketId: { type: String, required: true, trim: true },
    ticketCode: { type: String, required: true, trim: true, uppercase: true },
    tripId: { type: String, trim: true, default: null },
    routeId: { type: String, required: true, trim: true },
    passengerId: { type: String, required: true, trim: true },
    fareMinor: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'fareMinor must be an integer (agorot)',
      },
    },
    currency: {
      type: String,
      enum: CURRENCIES,
      default: 'ILS',
    },
    status: {
      type: String,
      enum: TICKET_STATUSES,
      required: true,
    },
    issuedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { _id: false }
);

const qrSchema = new mongoose.Schema(
  {
    /** Snapshot of ticket details encoded into the QR JWT claims */
    payload: {
      type: qrPayloadSchema,
      required: true,
    },
    /** SHA-256 of the signed QR JWT (only hash is stored for verification) */
    tokenHash: { type: String, required: true },
    jti: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    /** Authenticated Cloudinary delivery URL (not publicly fetchable) */
    imageUrl: { type: String, default: null },
    imagePublicId: { type: String, default: null },
  },
  { _id: false }
);

const validationSchema = new mongoose.Schema(
  {
    scannedAt: { type: Date },
    scannedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    actionHistory: { type: mongoose.Schema.Types.ObjectId, ref: 'ActionHistory' },
  },
  { _id: false }
);

const ticketSchema = new mongoose.Schema(
  {
    passenger: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    trip: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Trip',
      default: null,
    },
    route: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Route',
      required: true,
      index: true,
    },
    fareMinor: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'fareMinor must be an integer (agorot)',
      },
    },
    currency: {
      type: String,
      enum: CURRENCIES,
      default: 'ILS',
    },
    ticketCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    qr: {
      type: qrSchema,
      required: true,
    },
    status: {
      type: String,
      enum: TICKET_STATUSES,
      default: 'active',
    },
    paymentStatus: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: 'unpaid',
    },
    validation: {
      type: validationSchema,
      default: undefined,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

ticketSchema.index({ 'qr.tokenHash': 1 }, { unique: true });
ticketSchema.index({ trip: 1, status: 1 });
ticketSchema.index({ route: 1, status: 1 });
ticketSchema.index({ passenger: 1, createdAt: -1 });
ticketSchema.index(
  { 'validation.actionHistory': 1 },
  {
    unique: true,
    partialFilterExpression: { 'validation.actionHistory': { $type: 'objectId' } },
  }
);
ticketSchema.pre('validate', function requireUsedAttribution() {
  if (this.status !== 'used' || !this.validation) return;
  if (!this.validation.scannedAt || !this.validation.scannedBy || !this.validation.actionHistory) {
    throw new Error('Used tickets require immutable validation attribution');
  }
});

module.exports = mongoose.model('Ticket', ticketSchema);
