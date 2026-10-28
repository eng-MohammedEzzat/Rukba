'use strict';

const { utcPeriodKey, isSafeNonNegativeInteger } = require('./earningCalculator');

const ACCEPTED_CURRENCIES = Object.freeze(['ILS']);
const ACCEPTED_STATUSES = Object.freeze(['accrued', 'paid']);
const SUPPORTED_POLICY = 'driver-earnings-v1';
const SUPPORTED_TRIGGER = 'trip_completed';
const SUPPORTED_PAYMENT_TREATMENT = 'used_regardless_of_unpaid_or_waived';
const PERIOD_KEY = /^[0-9]{4}-(0[1-9]|1[0-2])$/;
const MAX_SAFE = Number.MAX_SAFE_INTEGER;

function warning(code, fields) {
  return { code, fields: [...new Set(fields)].sort() };
}

function dedupeWarnings(warnings) {
  const byCode = new Map();
  for (const warningEntry of warnings) {
    const current = byCode.get(warningEntry.code) || new Set();
    for (const field of warningEntry.fields) current.add(field);
    byCode.set(warningEntry.code, current);
  }
  return [...byCode.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([code, fields]) => ({ code, fields: [...fields].sort() }));
}

function asObjectIdString(value) {
  if (value == null) return null;
  if (typeof value === 'string' && /^[a-fA-F0-9]{24}$/.test(value)) return value;
  if (typeof value === 'object' && value._bsontype === 'ObjectId') return String(value);
  if (typeof value.toString === 'function') {
    const text = String(value);
    return /^[a-fA-F0-9]{24}$/.test(text) ? text : null;
  }
  return null;
}

function asUtcDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}

function snapshotText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function addSafe(left, right) {
  if (left == null || right == null) return { value: null, overflow: left != null || right != null };
  const next = left + right;
  if (next > MAX_SAFE) return { value: null, overflow: true };
  return { value: next, overflow: false };
}

function tripOwnershipMatches(tripId, driverId, owner, tripOwners) {
  if (!tripOwners || !tripId || !tripOwners.has(tripId)) return true;
  const tripDriver = tripOwners.get(tripId);
  return Boolean(tripDriver && tripDriver === owner && tripDriver === driverId);
}

function classifyEarning(raw, { ownerId, duplicateTripIds = new Set(), tripOwners } = {}) {
  const warnings = [];
  const driverId = asObjectIdString(raw?.driver);
  const tripId = asObjectIdString(raw?.trip);
  const owner = asObjectIdString(ownerId);
  const attributable = Boolean(
    driverId
    && tripId
    && owner
    && driverId === owner
    && tripOwnershipMatches(tripId, driverId, owner, tripOwners)
  );
  if (!attributable) {
    warnings.push(warning('ATTRIBUTION_UNAVAILABLE', [
      'earnings',
      'totals.groups',
    ]));
  }

  const duplicate = Boolean(tripId && duplicateTripIds.has(tripId));
  if (duplicate) {
    warnings.push(warning('DUPLICATE_SOURCE', [
      'earnings',
      'totals.groups',
    ]));
  }

  const origin = snapshotText(raw?.routeOrigin);
  const destination = snapshotText(raw?.routeDestination);
  if (origin == null || destination == null) {
    warnings.push(warning('SNAPSHOT_UNAVAILABLE', ['earnings.route']));
  }

  const ticketCountValid = isSafeNonNegativeInteger(raw?.ticketCount) && raw.ticketCount >= 1;
  if (!ticketCountValid) {
    warnings.push(warning('TICKET_COUNT_UNAVAILABLE', [
      'earnings.ticketCount',
      'totals.ticketCount',
      'totals.groups.ticketCount',
    ]));
  }

  const grossValid = isSafeNonNegativeInteger(raw?.grossMinor);
  const feeValid = isSafeNonNegativeInteger(raw?.platformFeeMinor);
  const netValid = isSafeNonNegativeInteger(raw?.netMinor);
  const policySupported = raw?.policyVersion === SUPPORTED_POLICY
    && raw?.trigger === SUPPORTED_TRIGGER
    && raw?.paymentTreatment === SUPPORTED_PAYMENT_TREATMENT
    && raw?.feeBasisPoints === 0;
  if (!grossValid || !feeValid || !netValid || !policySupported) {
    warnings.push(warning('AMOUNT_UNAVAILABLE', [
      'earnings.amounts',
      'totals.groups.amounts',
    ]));
  }

  const amountsPresent = grossValid && feeValid && netValid;
  const relationshipOk = amountsPresent
    && raw.grossMinor === raw.platformFeeMinor + raw.netMinor;
  const policyOk = policySupported
    && amountsPresent
    && raw.platformFeeMinor === 0
    && raw.netMinor === raw.grossMinor;
  if (policySupported && amountsPresent && (!relationshipOk || !policyOk)) {
    warnings.push(warning('AMOUNT_INCONSISTENT', [
      'earnings.amounts',
      'totals.groups.amounts',
    ]));
  }

  const currency = ACCEPTED_CURRENCIES.includes(raw?.currency) ? raw.currency : null;
  if (currency == null) {
    warnings.push(warning('CURRENCY_UNAVAILABLE', [
      'earnings.amounts.currency',
      'totals.groups',
    ]));
  }

  const status = ACCEPTED_STATUSES.includes(raw?.status) ? raw.status : null;
  if (status == null) {
    warnings.push(warning('STATUS_UNAVAILABLE', [
      'earnings.status',
      'totals.groups',
    ]));
  }

  const accruedAt = asUtcDate(raw?.accruedAt);
  const periodKey = typeof raw?.periodKey === 'string' && PERIOD_KEY.test(raw.periodKey)
    ? raw.periodKey
    : null;
  const expectedPeriod = accruedAt ? utcPeriodKey(accruedAt) : null;
  const periodAgreed = Boolean(accruedAt && periodKey && periodKey === expectedPeriod);
  if (!periodAgreed) {
    warnings.push(warning('PERIOD_UNAVAILABLE', [
      'earnings.accruedAt',
      'earnings.period',
    ]));
  }

  const moneyOk = ticketCountValid
    && amountsPresent
    && relationshipOk
    && policyOk
    && currency != null;
  const usable = attributable && !duplicate;

  return {
    usable,
    attributable,
    duplicate,
    warnings,
    tripId,
    driverId,
    route: { origin, destination },
    ticketCount: usable && ticketCountValid ? raw.ticketCount : null,
    amounts: {
      grossMinor: usable && moneyOk ? raw.grossMinor : null,
      platformFeeMinor: usable && moneyOk ? raw.platformFeeMinor : null,
      netMinor: usable && moneyOk ? raw.netMinor : null,
      currency: usable && currency != null ? currency : null,
    },
    status: usable ? status : null,
    accruedAt: accruedAt && (usable || attributable) ? accruedAt.toISOString() : null,
    period: periodAgreed && usable ? periodKey : (periodAgreed ? periodKey : null),
    policyVersion: typeof raw?.policyVersion === 'string' ? raw.policyVersion : null,
    currency,
    groupable: usable && currency != null && status != null,
    moneyOk: usable && moneyOk,
    ticketOk: usable && ticketCountValid,
  };
}

function emptyTotals() {
  return { entryCount: 0, ticketCount: 0, groups: [] };
}

function summarizeTotals(classified) {
  const warnings = [];
  const groups = new Map();
  let entryCount = 0;
  let ticketSum = 0;
  let ticketPoisoned = false;
  let ticketOverflow = false;

  for (const classifiedEntry of classified) {
    warnings.push(...classifiedEntry.warnings);
    if (!classifiedEntry.usable) continue;
    entryCount += 1;
    if (classifiedEntry.ticketOk) {
      const added = addSafe(ticketSum, classifiedEntry.ticketCount);
      if (added.overflow) ticketOverflow = true;
      else ticketSum = added.value;
    } else {
      ticketPoisoned = true;
    }
    if (!classifiedEntry.groupable) continue;
    const key = `${classifiedEntry.currency}:${classifiedEntry.status}`;
    const current = groups.get(key) || {
      currency: classifiedEntry.currency,
      status: classifiedEntry.status,
      entryCount: 0,
      ticketCount: 0,
      grossMinor: 0,
      platformFeeMinor: 0,
      netMinor: 0,
      ticketOk: true,
      moneyOk: true,
      overflow: { ticketCount: false, grossMinor: false, platformFeeMinor: false, netMinor: false },
    };
    current.entryCount += 1;
    if (classifiedEntry.ticketOk) {
      const added = addSafe(current.ticketCount, classifiedEntry.ticketCount);
      if (added.overflow) current.overflow.ticketCount = true;
      else current.ticketCount = added.value;
    } else {
      current.ticketOk = false;
    }
    if (classifiedEntry.moneyOk) {
      const gross = addSafe(current.grossMinor, classifiedEntry.amounts.grossMinor);
      const fee = addSafe(current.platformFeeMinor, classifiedEntry.amounts.platformFeeMinor);
      const net = addSafe(current.netMinor, classifiedEntry.amounts.netMinor);
      if (gross.overflow) current.overflow.grossMinor = true;
      else current.grossMinor = gross.value;
      if (fee.overflow) current.overflow.platformFeeMinor = true;
      else current.platformFeeMinor = fee.value;
      if (net.overflow) current.overflow.netMinor = true;
      else current.netMinor = net.value;
    } else {
      current.moneyOk = false;
    }
    groups.set(key, current);
  }

  const publicGroups = [...groups.values()]
    .sort((left, right) => left.currency.localeCompare(right.currency)
      || left.status.localeCompare(right.status))
    .map((group) => {
      if (group.overflow.ticketCount) {
        warnings.push(warning('TOTAL_OVERFLOW', ['totals.groups.ticketCount']));
      }
      if (group.overflow.grossMinor || group.overflow.platformFeeMinor || group.overflow.netMinor) {
        warnings.push(warning('TOTAL_OVERFLOW', ['totals.groups.amounts']));
      }
      return {
        currency: group.currency,
        status: group.status,
        entryCount: group.entryCount,
        ticketCount: group.ticketOk && !group.overflow.ticketCount ? group.ticketCount : null,
        grossMinor: group.moneyOk && !group.overflow.grossMinor ? group.grossMinor : null,
        platformFeeMinor: group.moneyOk && !group.overflow.platformFeeMinor ? group.platformFeeMinor : null,
        netMinor: group.moneyOk && !group.overflow.netMinor ? group.netMinor : null,
      };
    });

  if (ticketOverflow) warnings.push(warning('TOTAL_OVERFLOW', ['totals.ticketCount']));

  return {
    totals: {
      entryCount,
      ticketCount: ticketPoisoned || ticketOverflow ? null : ticketSum,
      groups: publicGroups,
    },
    warnings: dedupeWarnings(warnings),
  };
}

module.exports = {
  classifyEarning,
  summarizeTotals,
  emptyTotals,
  dedupeWarnings,
  asObjectIdString,
};
