'use strict';

const mongoose = require('mongoose');
const { NOTIFICATION_TYPES } = require('../../constants/enums');

const refsSchema = new mongoose.Schema(
  {
    ticketId: { type: mongoose.Schema.Types.ObjectId, default: null },
    tripId: { type: mongoose.Schema.Types.ObjectId, default: null },
    routeId: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { _id: false }
);

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: true,
    },
    title: {
      type: String,
      trim: true,
      default: '',
    },
    body: {
      type: String,
      trim: true,
      default: '',
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    refs: {
      type: refsSchema,
      default: () => ({}),
    },
    eventKey: {
      type: String,
      trim: true,
      default: null,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, createdAt: -1, _id: -1 });
notificationSchema.index({ user: 1, readAt: 1, createdAt: -1, _id: -1 });
notificationSchema.index(
  { user: 1, eventKey: 1 },
  { unique: true, partialFilterExpression: { eventKey: { $type: 'string' } } }
);

module.exports = mongoose.model('Notification', notificationSchema);
