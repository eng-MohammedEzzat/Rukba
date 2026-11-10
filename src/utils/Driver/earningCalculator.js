'use strict';

const ApiError = require('../shared/ApiError');

const MAX_SAFE = Number.MAX_SAFE_INTEGER;
const ACCEPTED_CURRENCIES = Object.freeze(['ILS']);
const POLICY_VERSION = 'driver-earnings-v1';
const TRIGGER = 'trip_completed';
const PAYMENT_TREATMENT = 'used_regardless_of_unpaid_or_waived';

function sourceInconsistent(message) {
  return new ApiError(409, message, { code: 'EARNING_SOURCE_INCONSISTENT' });
}

function isSafeNonNegativeInteger(value) {
  return typeof value === 'number'
    && Number.isInteger(value)
    && Number.isFinite(value)
    && value >= 0
    && value <= MAX_SAFE;
}

function sameId(left, right) {
  return String(left) === String(right);
}

function utcPeriodKey(date) {
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function qualifyingTickets(tickets, tripId) {
  const qualified = [];
  for (const ticket of tickets) {
    if (!ticket || ticket.status !== 'used') continue;
    if (!sameId(ticket.trip, tripId)) continue;
    qualified.push(ticket);
  }
  return qualified;
}

function calculateEarning({ tickets = [], ticketsUsed, completedAt, tripId } = {}) {
  if (!(completedAt instanceof Date) || Number.isNaN(completedAt.getTime())) {
    throw sourceInconsistent('وقت إنهاء الرحلة غير متوفر');
  }
  if (!isSafeNonNegativeInteger(ticketsUsed)) {
    throw sourceInconsistent('عدّاد التذاكر المستخدمة في الرحلة غير متّسق');
  }

  const qualified = qualifyingTickets(tickets, tripId);
  if (qualified.length !== ticketsUsed) {
    throw sourceInconsistent('عدد التذاكر المستخدمة لا يطابق عدّاد الرحلة');
  }
  if (qualified.length === 0) return null;

  let currency = null;
  let grossMinor = 0;
  for (const ticket of qualified) {
    if (!isSafeNonNegativeInteger(ticket.fareMinor)) {
      throw sourceInconsistent('أجرة إحدى التذاكر المحتسبة ليست عددًا صحيحًا صالحًا');
    }
    if (!ACCEPTED_CURRENCIES.includes(ticket.currency)) {
      throw sourceInconsistent('عملة إحدى التذاكر المحتسبة مفقودة أو غير مدعومة');
    }
    if (currency && currency !== ticket.currency) {
      throw sourceInconsistent('التذاكر المحتسبة ليست بعملة واحدة');
    }
    currency = ticket.currency;
    const next = grossMinor + ticket.fareMinor;
    if (next > MAX_SAFE) {
      throw sourceInconsistent('مجموع الأجرة يتجاوز الحد المسموح به');
    }
    grossMinor = next;
  }

  return {
    ticketCount: qualified.length,
    grossMinor,
    platformFeeMinor: 0,
    netMinor: grossMinor,
    currency,
    feeBasisPoints: 0,
    policyVersion: POLICY_VERSION,
    trigger: TRIGGER,
    paymentTreatment: PAYMENT_TREATMENT,
    status: 'accrued',
    accruedAt: completedAt,
    periodKey: utcPeriodKey(completedAt),
  };
}

module.exports = {
  ACCEPTED_CURRENCIES,
  POLICY_VERSION,
  TRIGGER,
  PAYMENT_TREATMENT,
  calculateEarning,
  utcPeriodKey,
  isSafeNonNegativeInteger,
};
