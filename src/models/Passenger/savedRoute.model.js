'use strict';

const mongoose = require('mongoose');
const { CURRENCIES } = require('../../constants/enums');

/**
 * Passenger-owned saved Route bookmark.
 * Journey labels are snapshotted at save time so later catalog edits
 * do not rewrite the passenger's saved entry.
 */
const savedRouteSchema = new mongoose.Schema(
  {
    passenger: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    route: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Route',
      required: true,
    },
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
  },
  { timestamps: true }
);

savedRouteSchema.index({ passenger: 1, route: 1 }, { unique: true });
savedRouteSchema.index({ passenger: 1, createdAt: -1, _id: -1 });

module.exports = mongoose.model('SavedRoute', savedRouteSchema);
