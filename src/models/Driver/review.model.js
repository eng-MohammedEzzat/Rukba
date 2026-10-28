'use strict';

const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    passenger: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    trip: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Trip',
      required: true,
    },
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: {
        validator: Number.isInteger,
        message: 'rating must be an integer from 1 to 5',
      },
    },
    comment: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },
  },
  { timestamps: true }
);

reviewSchema.index({ passenger: 1, trip: 1 }, { unique: true });
reviewSchema.index({ driver: 1, createdAt: -1 });

module.exports = mongoose.model('Review', reviewSchema);
