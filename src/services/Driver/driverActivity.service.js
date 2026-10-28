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



const MAX_TRANSIENT_RETRIES = 2;
const MAX_SAFE = Number.MAX_SAFE_INTEGER;
const SNAPSHOT_TRANSACTION = Object.freeze({
  readConcern: { level: 'snapshot' },
  readPreference: 'primary',
});

const KNOWN_STATUSES = Object.freeze([
  'boarding',
  'in_progress',
  'completed',
  'withdrawn',
  'cancelled',
]);

const COUNTERS = Object.freeze([
  { stat: 'ticketsIssued', total: 'issued' },
  { stat: 'ticketsUsed', total: 'used' },
  { stat: 'ticketsCancelled', total: 'cancelled' },
]);



const readBarriers = {
  afterSnapshotStart: null,
  beforeRead: null,
};

function setReadBarriers({ afterSnapshotStart = null, beforeRead = null } = {}) {
  readBarriers.afterSnapshotStart = afterSnapshotStart;
  readBarriers.beforeRead = beforeRead;
}


function ownerId(driverId) {
  return new mongoose.Types.ObjectId(String(driverId));
}

function unavailable() {
  return new ApiError(503, 'Activity is temporarily unavailable', {
    code: 'TEMPORARILY_UNAVAILABLE',
  });
}

function isValidCounter(value) {
  return Number.isInteger(value) && value >= 0 && value <= MAX_SAFE;
}

function warning(code, fields) {
  return { code, fields: [...new Set(fields)].sort() };
}

function dedupeWarnings(warnings) {
  const byCode = new Map();
  for (const { code, fields } of warnings) {
    const merged = byCode.get(code) || new Set();
    fields.forEach((field) => merged.add(field));
    byCode.set(code, merged);
  }
  return [...byCode.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([code, fields]) => ({ code, fields: [...fields].sort() }));
}


function buildMatch(driverId, query) {
  const match = { driver: ownerId(driverId) };
  if (query.status) match.status = query.status;
  const createdAt = {};
  if (query.start) createdAt.$gte = query.start;
  if (query.end) createdAt.$lt = query.end;
  if (Object.keys(createdAt).length) match.createdAt = createdAt;
  return match;
}

function validCounterExpr(stat) {
  const path = `$stats.${stat}`;
  return {
    $and: [
      { $ne: [{ $ifNull: [path, null] }, null] },
      { $in: [{ $type: path }, ['int', 'long', 'double', 'decimal']] },
      { $eq: [{ $mod: [{ $abs: { $toDouble: path } }, 1] }, 0] },
      { $gte: [{ $toDouble: path }, 0] },
      { $lte: [{ $toDouble: path }, MAX_SAFE] },
    ],
  };
}

function countIf(condition) {
  return { $sum: { $cond: [condition, 1, 0] } };
}

function totalsGroup() {
  const valid = Object.fromEntries(COUNTERS.map(({ stat }) => [stat, validCounterExpr(stat)]));
  const asDouble = (stat) => ({ $toDouble: `$stats.${stat}` });
  const contradiction = {
    $and: [
      ...Object.values(valid),
      { $gt: [{ $add: [asDouble('ticketsUsed'), asDouble('ticketsCancelled')] }, asDouble('ticketsIssued')] },
    ],
  };

  const group = {
    _id: null,
    totalRuns: { $sum: 1 },
    unknownStateCount: countIf({ $not: [{ $in: ['$status', KNOWN_STATUSES] }] }),
    contradictionCount: countIf(contradiction),
    missingCreatedAt: countIf({ $ne: [{ $type: '$createdAt' }, 'date'] }),
  };
  for (const status of KNOWN_STATUSES) {
    group[status] = countIf({ $eq: ['$status', status] });
  }
  for (const { stat, total } of COUNTERS) {
    group[`${total}Invalid`] = countIf({ $not: [valid[stat]] });
    group[`${total}Sum`] = { $sum: { $cond: [valid[stat], { $toDecimal: `$stats.${stat}` }, 0] } };
  }
  return group;
}

function activityPipeline(driverId, query) {
  return [
    { $match: buildMatch(driverId, query) },
    {
      $facet: {
        page: [
          { $sort: { createdAt: -1, _id: -1 } },
          { $skip: (query.page - 1) * query.limit },
          { $limit: query.limit },
        ],
        totals: [{ $group: totalsGroup() }],
      },
    },
  ];
}


function toUtcIso(value) {
  if (value == null || value === '') return { iso: null, valid: false };
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return { iso: null, valid: false };
  return { iso: date.toISOString(), valid: true };
}

function snapshotText(value) {
  if (typeof value !== 'string') return null;
  return value.trim() || null;
}

function snapshotInteger(value, { min = 0 } = {}) {
  return isValidCounter(value) && value >= min ? value : null;
}

function routeAvailability(route) {
  if (!route) return 'missing';
  return route.isActive === true ? 'active' : 'inactive';
}

function counterFields({ stat, total }) {
  return [`activity.stats.${stat}`, `totals.tickets.${total}`];
}

function classifyCounters(stats = {}) {
  const valid = Object.fromEntries(COUNTERS.map(({ stat }) => [stat, isValidCounter(stats[stat])]));
  const warnings = COUNTERS
    .filter(({ stat }) => !valid[stat])
    .map((counter) => warning('COUNTER_UNAVAILABLE', counterFields(counter)));

  const contradicted = COUNTERS.every(({ stat }) => valid[stat])
    && stats.ticketsUsed + stats.ticketsCancelled > stats.ticketsIssued;
  if (contradicted) {
    warnings.push(warning('COUNTER_INCONSISTENT', COUNTERS.flatMap(counterFields)));
  }

  return {
    stats: Object.fromEntries(
      COUNTERS.map(({ stat }) => [stat, valid[stat] && !contradicted ? stats[stat] : null])
    ),
    warnings,
  };
}

function toActivityEntry(trip, currentRoute) {
  const warnings = [];

  const snapshots = {
    routeOrigin: snapshotText(trip?.routeOrigin),
    routeDestination: snapshotText(trip?.routeDestination),
    fareMinor: snapshotInteger(trip?.fareMinor),
    currency: snapshotText(trip?.currency),
    estimatedDurationMinutes: snapshotInteger(trip?.estimatedDurationMinutes, { min: 1 }),
    'vehicleSnapshot.description': snapshotText(trip?.vehicleSnapshot?.description),
  };
  for (const [field, value] of Object.entries(snapshots)) {
    if (value == null) warnings.push(warning('SNAPSHOT_UNAVAILABLE', [`activity.${field}`]));
  }

  const created = toUtcIso(trip?.createdAt);
  if (!created.valid) warnings.push(warning('TIMESTAMP_UNAVAILABLE', ['activity.createdAt']));

  const status = KNOWN_STATUSES.includes(trip?.status) ? trip.status : null;
  if (status == null) warnings.push(warning('RUN_STATE_UNAVAILABLE', ['activity.status', 'totals.byStatus']));

  const started = toUtcIso(trip?.startedAt);
  const completed = toUtcIso(trip?.completedAt);
  if ((status === 'in_progress' || status === 'completed') && !started.valid) {
    warnings.push(warning('SNAPSHOT_UNAVAILABLE', ['activity.startedAt']));
  }
  if (status === 'completed' && !completed.valid) {
    warnings.push(warning('SNAPSHOT_UNAVAILABLE', ['activity.completedAt']));
  }

  const counters = classifyCounters(trip?.stats);
  warnings.push(...counters.warnings);

  return {
    entry: {
      id: String(trip?._id || ''),
      routeOrigin: snapshots.routeOrigin,
      routeDestination: snapshots.routeDestination,
      fareMinor: snapshots.fareMinor,
      currency: snapshots.currency,
      estimatedDurationMinutes: snapshots.estimatedDurationMinutes,
      vehicleSnapshot: { description: snapshots['vehicleSnapshot.description'] },
      status,
      createdAt: created.iso,
      startedAt: started.iso,
      completedAt: completed.iso,
      stats: counters.stats,
      availability: {
        trip: trip?.isDeleted === true ? 'soft_deleted' : 'retained',
        route: routeAvailability(currentRoute),
      },
    },
    warnings,
  };
}

function presentPage(trips, routesById) {
  const activity = [];
  const warnings = [];
  for (const trip of trips) {
    const { entry, warnings: entryWarnings } = toActivityEntry(trip, routesById.get(String(trip.route)));
    activity.push(entry);
    warnings.push(...entryWarnings);
  }
  return { activity, warnings };
}


function decimalToSafeInteger(value) {
  if (value == null) return { value: 0, overflow: false };
  const numeric = Number(String(value));
  if (!Number.isFinite(numeric) || numeric > MAX_SAFE) return { value: null, overflow: true };
  return { value: numeric, overflow: false };
}

function scopeCoversAllCompleted(filters = {}) {
  return !filters.start && !filters.end && (!filters.status || filters.status === 'completed');
}

function compareCompleted(lifetimeCompleted, profileTotalTrips) {
  if (!isValidCounter(lifetimeCompleted) || !isValidCounter(profileTotalTrips)) return 'unavailable';
  return lifetimeCompleted === profileTotalTrips ? 'consistent' : 'inconsistent';
}


function summarizeScope(grouped = {}, { lifetimeCompleted, profileTotalTrips, filters = {} } = {}) {
  const warnings = [];
  const totalRuns = grouped.totalRuns || 0;
  const contradicted = Boolean(grouped.contradictionCount);

  const tickets = {};
  for (const { total } of COUNTERS) {
    const field = `totals.tickets.${total}`;
    const invalid = Boolean(grouped[`${total}Invalid`]);
    const sum = decimalToSafeInteger(grouped[`${total}Sum`]);
    if (invalid) warnings.push(warning('COUNTER_UNAVAILABLE', [field]));
    else if (!contradicted && sum.overflow) warnings.push(warning('TOTAL_OVERFLOW', [field]));
    tickets[total] = invalid || contradicted ? null : sum.value;
  }
  if (contradicted) {
    warnings.push(warning('COUNTER_INCONSISTENT', COUNTERS.map(({ total }) => `totals.tickets.${total}`)));
  }

  const statusesKnown = !grouped.unknownStateCount;
  const byStatus = Object.fromEntries(
    KNOWN_STATUSES.map((status) => [status, statusesKnown ? grouped[status] || 0 : null])
  );
  if (!statusesKnown) warnings.push(warning('RUN_STATE_UNAVAILABLE', ['totals.byStatus']));

  const completedComparison = compareCompleted(lifetimeCompleted, profileTotalTrips);
  if (completedComparison === 'unavailable') {
    warnings.push(warning('COMPLETED_COMPARISON_UNAVAILABLE', ['integrity.completedComparison']));
  } else if (completedComparison === 'inconsistent') {
    warnings.push(warning('COMPLETED_COUNT_MISMATCH', ['totals.byStatus.completed']));
    if (totalRuns > 0 && scopeCoversAllCompleted(filters)) byStatus.completed = null;
  }

  if (grouped.missingCreatedAt) {
    warnings.push(warning('TIMESTAMP_UNAVAILABLE', ['activity.createdAt']));
  }

  return {
    totals: { totalRuns, byStatus, tickets },
    completedComparison,
    warnings,
  };
}

function finalizeIntegrity(completedComparison, warnings) {
  return {
    completedComparison,
    warnings: dedupeWarnings(warnings),
  };
}

function normalizedScope(query = {}) {
  return {
    status: query.status || null,
    start: query.start ? query.start.toISOString() : null,
    end: query.end ? query.end.toISOString() : null,
  };
}



async function loadEligibility(db, driverId, session) {
  const user = await db.collection('users').findOne({ _id: ownerId(driverId) }, { session });
  const profile = await db.collection('driverprofiles').findOne({ user: ownerId(driverId) }, { session });
  if (!isEligibleDriver(user, profile)) {
    throw new ApiError(403, 'Driver is not eligible to operate', { code: 'DRIVER_NOT_ELIGIBLE' });
  }
  return profile;
}

async function loadPageRoutes(db, trips, session) {
  const routeIds = [...new Set(trips.map((trip) => trip.route).filter(Boolean))];
  if (!routeIds.length) return new Map();
  const routes = await db.collection('routes').find({ _id: { $in: routeIds } }, { session }).toArray();
  return new Map(routes.map((route) => [String(route._id), route]));
}

async function readActivity(session, driverId, query) {
  const db = mongoose.connection.db;
  const trips = db.collection('trips');

  const profile = await loadEligibility(db, driverId, session);
  if (readBarriers.afterSnapshotStart) await readBarriers.afterSnapshotStart();
  if (readBarriers.beforeRead) await readBarriers.beforeRead();

  const [facet] = await trips.aggregate(activityPipeline(driverId, query), { session }).toArray();
  const lifetimeCompleted = await trips.countDocuments(
    { driver: ownerId(driverId), status: 'completed' },
    { session }
  );
  const pageTrips = facet?.page || [];
  const routesById = await loadPageRoutes(db, pageTrips, session);

  const presented = presentPage(pageTrips, routesById);
  const scoped = summarizeScope(facet?.totals?.[0], {
    lifetimeCompleted,
    profileTotalTrips: profile.totalTrips,
    filters: query,
  });

  return {
    activity: presented.activity,
    pagination: paginationMeta({
      page: query.page,
      limit: query.limit,
      total: scoped.totals.totalRuns,
    }),
    scope: normalizedScope(query),
    totals: scoped.totals,
    integrity: finalizeIntegrity(scoped.completedComparison, [...presented.warnings, ...scoped.warnings]),
  };
}



async function readInSnapshot(driverId, query) {
  const session = await mongoose.startSession();
  try {
    session.startTransaction(SNAPSHOT_TRANSACTION);
    const activityPage = await readActivity(session, driverId, query);
    await session.commitTransaction();
    return activityPage;
  } catch (err) {
    try {
      await session.abortTransaction();
    } catch {
    }
    throw err;
  } finally {
    await session.endSession();
  }
}

async function getActivity(driverId, query) {
  if (!(await deploymentSupportsTransactions())) {
    return runInTransaction((session) => readActivity(session, driverId, query));
  }

  const deadline = Date.now() + env.driverActivityBudgetMs;
  for (let attempt = 0; ; attempt += 1) {
    if (Date.now() > deadline) throw unavailable();
    try {
      return await readInSnapshot(driverId, query);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      if (!isTransientTransactionError(err) || attempt >= MAX_TRANSIENT_RETRIES) throw unavailable();
    }
  }
}

module.exports = {
  getActivity,
  setReadBarriers,
  toActivityEntry,
  summarizeScope,
  finalizeIntegrity,
  isValidCounter,
};
