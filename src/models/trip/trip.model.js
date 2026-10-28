'use strict';

const mongoose = require('mongoose');
const { TRIP_STATUSES, CURRENCIES } = require('../../constants/enums');

const pointSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
    coordinates: {
      type: [Number],
      validate: {
        validator(value) {
          return (
            Array.isArray(value) &&
            value.length === 2 &&
            value.every((n) => typeof n === 'number' && Number.isFinite(n))
          );
        },
        message: 'coordinates must be [lng, lat]',
      },
    },
  },
  { _id: false }
);

const tripStatsSchema = new mongoose.Schema(
  {
    ticketsIssued: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
    ticketsUsed: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
    ticketsCancelled: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
  },
  { _id: false }
);

const tripSchema = new mongoose.Schema(
  {
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required() { return this.isNew && ['boarding', 'in_progress'].includes(this.status); },
      default: null,
    },
    vehicleSnapshot: {
      description: { type: String, trim: true, maxlength: 500 },
    },
    driverActive: { type: Boolean, default: false },
    revision: {
      type: Number,
      default: 0,
      min: 0,
      validate: { validator: Number.isSafeInteger, message: 'revision must be a safe integer' },
    },
    route: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Route',
      required: true,
    },
    routeOrigin: {
      type: String,
      required: true,
      trim: true,
    },
    routeDestination: {
      type: String,
      required: true,
      trim: true,
    },
    // Driver-created runs retain the Route values captured at creation.
    fareMinor: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: 'fareMinor must be an integer (agorot)',
      },
    },
    currency: {
      type: String,
      enum: CURRENCIES,
      default: 'ILS',
    },
    estimatedDurationMinutes: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: 'estimatedDurationMinutes must be a positive integer',
      },
    },
    lineLabel: {
      type: String,
      trim: true,
      maxlength: 40,
      default: null,
    },
    distanceMeters: {
      type: Number,
      default: null,
      min: 1,
      validate: {
        validator(value) {
          return value == null || (Number.isSafeInteger(value) && value >= 1);
        },
        message: 'distanceMeters must be a positive safe integer',
      },
    },
    vehicleLabel: {
      type: String,
      trim: true,
      maxlength: 40,
      default: null,
    },
    status: {
      type: String,
      enum: TRIP_STATUSES,
      default: 'boarding',
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
      validate: {
        validator(value) {
          return !value || (this.startedAt && value >= this.startedAt);
        },
        message: 'completedAt must not precede startedAt',
      },
    },
    currentLocation: {
      type: pointSchema,
      default: undefined,
    },
    stats: {
      type: tripStatsSchema,
      default: () => ({}),
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

tripSchema.index({
  isDeleted: 1,
  status: 1,
  routeOrigin: 1,
  routeDestination: 1,
  fareMinor: 1,
  _id: 1,
});
tripSchema.index({
  route: 1,
  isDeleted: 1,
  status: 1,
  fareMinor: 1,
  _id: 1,
});
tripSchema.index({ driver: 1, status: 1 });
tripSchema.index(
  { driver: 1 },
  { unique: true, partialFilterExpression: { driverActive: true } }
);
tripSchema.index({ status: 1, route: 1, driverActive: 1 });
tripSchema.index({ driver: 1, driverActive: 1, createdAt: -1, _id: -1 });
tripSchema.index({ driver: 1, createdAt: -1, _id: -1 });
tripSchema.index({ driver: 1, status: 1, createdAt: -1, _id: -1 });
tripSchema.index({ driver: 1, status: 1, completedAt: -1, _id: -1 });
tripSchema.index({ currentLocation: '2dsphere' });

tripSchema.pre('validate', function validateDriverRun() {
  if (!this.isNew) return;
  if (!['boarding', 'in_progress', 'completed', 'withdrawn'].includes(this.status)) return;
  if (!this.vehicleSnapshot?.description?.trim()) {
    throw new Error('Driver runs require a vehicle description snapshot');
  }
  const shouldBeActive = ['boarding', 'in_progress'].includes(this.status);
  if (this.driverActive !== shouldBeActive) {
    throw new Error('driverActive must match the Driver run status');
  }
});

module.exports = mongoose.model('Trip', tripSchema);
