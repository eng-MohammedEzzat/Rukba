'use strict';

const ROLES = Object.freeze(['passenger', 'driver', 'admin']);

const USER_STATUSES = Object.freeze(['active', 'suspended', 'deleted']);

const VERIFICATION_STATUSES = Object.freeze([
  'pending',
  'verified',
  'rejected',
]);

const TRIP_STATUSES = Object.freeze([
  'boarding',
  'in_progress',
  'completed',
  'withdrawn',
  'cancelled',
]);

const TICKET_STATUSES = Object.freeze([
  'active',
  'used',
  'cancelled',
  'expired',
]);

const PAYMENT_STATUSES = Object.freeze(['unpaid', 'waived']);

const EARNING_STATUSES = Object.freeze(['accrued', 'paid']);

const SCAN_RESULTS = Object.freeze([
  'valid',
  'already_used',
  'expired',
  'cancelled',
  'invalid_signature',
  'wrong_trip',
  'not_found',
  'other',
]);

const CURRENCIES = Object.freeze(['ILS']);

const NOTIFICATION_TYPES = Object.freeze([
  'trip_update',
  'ticket_issued',
  'ticket_used',
  'receipt_issued',
  'system',
]);

const ACTION_TYPES = Object.freeze([
  'ticket_booked',
  'ticket_cancelled',
  'ticket_scanned',
  'receipt_viewed',
  'receipt_printed',
  'trip_created',
  'trip_withdrawn',
  'trip_started',
  'trip_completed',
  'ticket_used',
]);

module.exports = {
  ROLES,
  USER_STATUSES,
  VERIFICATION_STATUSES,
  TRIP_STATUSES,
  TICKET_STATUSES,
  PAYMENT_STATUSES,
  EARNING_STATUSES,
  SCAN_RESULTS,
  CURRENCIES,
  NOTIFICATION_TYPES,
  ACTION_TYPES,
};
