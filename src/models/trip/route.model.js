'use strict';

const mongoose = require('mongoose');
const { CURRENCIES } = require('../../constants/enums');

const routeSchema = new mongoose.Schema(
  {
    origin: {
      type: String,
      required: true,
      trim: true,
    },
    destination: {
      type: String,
      required: true,
      trim: true,
    },
    defaultFareMinor: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'defaultFareMinor must be an integer (agorot)',
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
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    bookingFence: {
      type: Number,
      default: 0,
      min: 0,
      validate: { validator: Number.isSafeInteger, message: 'bookingFence must be a safe integer' },
    },
  },
  { timestamps: true }
);

routeSchema.index({ origin: 1, destination: 1 }, { unique: true });
routeSchema.index({ isActive: 1, origin: 1 });

routeSchema.pre('validate', function ensureDifferentEnds() {
  if (
    this.origin &&
    this.destination &&
    this.origin.trim().toLowerCase() === this.destination.trim().toLowerCase()
  ) {
    throw new Error('origin and destination must be different');
  }
});

module.exports = mongoose.model('Route', routeSchema);
