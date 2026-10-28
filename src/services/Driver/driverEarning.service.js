'use strict';

const mongoose = require('mongoose');
const env = require('../../config/env');
const ApiError = require('../../utils/shared/ApiError');
const isTransientTransactionError = require('../../utils/shared/isTransientTransactionError');
const {
  deploymentSupportsTransactions,
  runInTransaction,
} = require('../../utils/shared/runInTransaction');
const { paginationMeta } = require('../../utils/shared/pagination');
const { isEligibleDriver } = require('../../utils/trip/driverTripEligibility');
const {
  classifyEarning,
  summarizeTotals,
  emptyTotals,
  asObjectIdString,
} = require('../../utils/Driver/earningIntegrity');
const { duplicateTripIds, loadTripOwners } = require('../../utils/Driver/earningScope');

const MAX_TRANSIENT_RETRIES = 2;
const readBarriers = {
  afterSnapshotStart: null,
  beforeRead: null,
};

function setReadBarriers(next = {}) {
  readBarriers.afterSnapshotStart = next.afterSnapshotStart || null;
  readBarriers.beforeRead = next.beforeRead || null;
}

function unavailable() {
  return new ApiError(503, 'Earnings are temporarily unavailable', {
    code: 'TEMPORARILY_UNAVAILABLE',
  });
}

function ownerId(driverId) {
  return new mongoose.Types.ObjectId(String(driverId));
}

function scopeMatch(driverId, query) {
  const owner = ownerId(driverId);
  const time = { accruedAt: { $gte: query.month.start, $lt: query.month.end } };
  const match = {
    $or: [
      { driver: owner, periodKey: query.month.month, ...time },
      { driver: owner, periodKey: { $ne: query.month.month }, ...time },
    ],
  };
  if (query.status) {
    match.$or = match.$or.map((branch) => ({ ...branch, status: query.status }));
  }
  return match;
}

async function loadEligibility(db, driverId, session) {
  const user = await db.collection('users').findOne({ _id: ownerId(driverId) }, { session });
  const profile = await db.collection('driverprofiles').findOne({ user: ownerId(driverId) }, { session });
  if (!isEligibleDriver(user, profile)) {
    throw new ApiError(403, 'Driver is not eligible to operate', { code: 'DRIVER_NOT_ELIGIBLE' });
  }
  return profile;
}

const SCOPE_PROJECTION = Object.freeze({
  _id: 1,
  trip: 1,
  driver: 1,
  routeOrigin: 1,
  routeDestination: 1,
  ticketCount: 1,
  grossMinor: 1,
  platformFeeMinor: 1,
  netMinor: 1,
  currency: 1,
  status: 1,
  accruedAt: 1,
  periodKey: 1,
  policyVersion: 1,
  trigger: 1,
  paymentTreatment: 1,
  feeBasisPoints: 1,
});
const PAGE_SORT = Object.freeze({ accruedAt: -1, _id: -1 });

function normalizedScope(query) {
  return {
    month: query.month.month,
    start: query.month.start.toISOString(),
    end: query.month.end.toISOString(),
    status: query.status || null,
  };
}

function retainedFor(owner, tripId, tripOwners) {
  return Boolean(tripId && tripOwners.get(tripId) === asObjectIdString(owner));
}

async function readEarnings(session, driverId, query) {
  const db = mongoose.connection.db;
  await loadEligibility(db, driverId, session);
  if (readBarriers.afterSnapshotStart) await readBarriers.afterSnapshotStart();
  if (readBarriers.beforeRead) await readBarriers.beforeRead();

  const match = scopeMatch(driverId, query);
  const skip = (query.page - 1) * query.limit;
  const collection = db.collection('earnings');
  const pageRows = await collection.find(match, { session })
    .sort(PAGE_SORT)
    .skip(skip)
    .limit(query.limit)
    .toArray();
  const scopeRows = await collection.find(match, { session, projection: SCOPE_PROJECTION })
    .sort(PAGE_SORT)
    .toArray();
  const tripOwners = await loadTripOwners(db, scopeRows, session);
  const duplicates = await duplicateTripIds(db, scopeRows, session);
  const classifyOpts = { ownerId: driverId, duplicateTripIds: duplicates, tripOwners };
  const classified = scopeRows.map((row) => classifyEarning(row, classifyOpts));
  const usableCount = classified.filter((item) => item.usable).length;
  const earnings = [];
  for (const row of pageRows) {
    const presented = toDriverEarning(row, {
      ...classifyOpts,
      tripExists: retainedFor(driverId, asObjectIdString(row.trip), tripOwners),
    });
    if (presented.entry) earnings.push(presented.entry);
  }
  const summarized = scopeRows.length ? summarizeTotals(classified) : {
    totals: emptyTotals(),
    warnings: [],
  };

  return {
    earnings,
    pagination: paginationMeta({
      page: query.page,
      limit: query.limit,
      total: usableCount,
    }),
    scope: normalizedScope(query),
    totals: summarized.totals,
    integrity: { warnings: summarized.warnings },
  };
}

async function getEarnings(driverId, query) {
  if (!(await deploymentSupportsTransactions())) {
    return runInTransaction((session) => readEarnings(session, driverId, query));
  }

  const deadline = Date.now() + env.driverEarningsBudgetMs;
  let attempt = 0;
  while (true) {
    if (Date.now() > deadline) throw unavailable();
    const session = await mongoose.startSession();
    try {
      session.startTransaction({
        readConcern: { level: 'snapshot' },
        readPreference: 'primary',
      });
      const earningsPage = await readEarnings(session, driverId, query);
      await session.commitTransaction();
      return earningsPage;
    } catch (err) {
      try {
        await session.abortTransaction();
      } catch {
        // The session is already closed or never started a transaction.
      }
      if (err instanceof ApiError) throw err;
      if (isTransientTransactionError(err) && attempt < MAX_TRANSIENT_RETRIES) {
        attempt += 1;
        continue;
      }
      throw unavailable();
    } finally {
      await session.endSession();
    }
  }
}

const FORBIDDEN = Object.freeze([
  'passenger',
  'ticket',
  'tickets',
  'receipt',
  'qr',
  'validation',
  'licence',
  'license',
  'payment',
  'paymentStatus',
  'payout',
  'revision',
  'operationId',
  'inputFingerprint',
  'authRevision',
  'password',
  'tokenHash',
  'jti',
]);

function toDriverEarning(raw, {
  tripExists = false,
  ownerId,
  duplicateTripIds,
  tripOwners,
} = {}) {
  const classified = classifyEarning(raw, { ownerId, duplicateTripIds, tripOwners });
  if (!classified.usable) {
    return { entry: null, warnings: classified.warnings };
  }

  const entry = {
    id: String(raw._id),
    tripId: classified.tripId,
    route: classified.route,
    ticketCount: classified.ticketCount,
    amounts: classified.amounts,
    status: classified.status,
    accruedAt: classified.accruedAt,
    period: classified.period,
    policyVersion: classified.policyVersion,
    sourceAvailability: tripExists ? 'retained' : 'unavailable',
  };
  return { entry, warnings: classified.warnings };
}

module.exports = { getEarnings, setReadBarriers, toDriverEarning, FORBIDDEN };
