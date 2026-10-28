'use strict';

const { User, DriverProfile, Route, Trip, Ticket, ActionHistory, Earning } = require('../../models');
const { runInTransaction } = require('../../utils/shared/runInTransaction');
const ApiError = require('../../utils/shared/ApiError');
const isTransientTransactionError = require('../../utils/shared/isTransientTransactionError');
const { isEligibleDriver, allowedActions } = require('../../utils/trip/driverTripEligibility');
const { calculateEarning } = require('../../utils/Driver/earningCalculator');
const { earningSnapshotsMatch } = require('../../utils/Driver/earningSnapshotsMatch');
const { createRunFingerprint, lifecycleFingerprint } = require('../../utils/trip/driverTripFingerprint');
const { routeCatalogDisplay, runJourneyDisplay } = require('../../utils/trip/journeyDisplay');

const MAX_SAFE = Number.MAX_SAFE_INTEGER;
const MAX_COMPLETION_RETRIES = 2;
const writeBarriers = {
  beforeEarningCreate: null,
  beforeTripWrite: null,
  beforeDriverCount: null,
  beforeEventWrite: null,
  beforeCommit: null,
};

function setWriteBarriers(next = {}) {
  writeBarriers.beforeEarningCreate = next.beforeEarningCreate || null;
  writeBarriers.beforeTripWrite = next.beforeTripWrite || null;
  writeBarriers.beforeDriverCount = next.beforeDriverCount || null;
  writeBarriers.beforeEventWrite = next.beforeEventWrite || null;
  writeBarriers.beforeCommit = next.beforeCommit || null;
}

function conflict(code, message) {
  return new ApiError(409, message, { code });
}

function exactFilter(value) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}$`, 'i');
}

async function eligibleInSession(driverId, session) {
  const user = await User.findById(driverId).select('+authRevision').session(session);
  const profile = await DriverProfile.findOne({ user: driverId }).session(session);
  if (!isEligibleDriver(user, profile)) {
    throw new ApiError(403, 'Driver is not eligible to operate', { code: 'DRIVER_INELIGIBLE' });
  }
  if (!Number.isSafeInteger(user.authRevision) || user.authRevision >= MAX_SAFE) {
    throw conflict('TRIP_STATE_CONFLICT', 'Driver authorization guard is unavailable');
  }
  const fenced = await User.updateOne(
    { _id: driverId, role: 'driver', status: 'active', isDeleted: { $ne: true },
      authRevision: user.authRevision },
    { $inc: { authRevision: 1 } }, { session }
  );
  if (fenced.matchedCount !== 1) {
    throw new ApiError(403, 'Driver is not eligible to operate', { code: 'DRIVER_INELIGIBLE' });
  }
  return profile;
}

async function findReplay(driverId, operationId, inputFingerprint, session) {
  const query = ActionHistory.findOne({ actor: driverId, operationId });
  const event = await (session ? query.session(session) : query);
  if (!event) return null;
  if (event.inputFingerprint !== inputFingerprint) {
    throw conflict('OPERATION_KEY_REUSED', 'Operation identifier was used for another action');
  }
  return { ...event.meta.result, replayed: true };
}

function transaction(work) {
  return runInTransaction(async (session) => {
    const committedReply = await work(session);
    if (writeBarriers.beforeCommit) await writeBarriers.beforeCommit();
    return committedReply;
  });
}

async function touchActiveRoute(routeId, session) {
  return Route.findOneAndUpdate(
    { _id: routeId, isActive: true, $or: [
      { bookingFence: { $exists: false } }, { bookingFence: { $lt: MAX_SAFE } },
    ] },
    { $inc: { bookingFence: 1 } },
    { session, returnDocument: 'after' }
  );
}

async function recordDriverEvent({ session, driverId, tripId, operationId,
  inputFingerprint, actionType, resultingStatus, reply, occurredAt }) {
  await ActionHistory.create([{
    actionType, actor: driverId, actorRole: 'driver', trip: tripId,
    operationId, inputFingerprint, resultingStatus, occurredAt,
    meta: { result: reply },
  }], { session });
}

async function listRoutes(query) {
  const filter = { isActive: true };
  if (query.origin) filter.origin = exactFilter(query.origin);
  if (query.destination) filter.destination = exactFilter(query.destination);
  const sort = { origin: 1, destination: 1, defaultFareMinor: 1, _id: 1 };
  const [total, routes] = await Promise.all([
    Route.countDocuments(filter),
    Route.find(filter).sort(sort).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
  ]);
  return {
    items: routes.map((route) => ({
      id: String(route._id), origin: route.origin, destination: route.destination,
      defaultFareMinor: route.defaultFareMinor, currency: route.currency,
      estimatedDurationMinutes: route.estimatedDurationMinutes,
      ...routeCatalogDisplay(route),
    })),
    pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) },
  };
}

async function createRun(driverId, { routeId, operationId, vehicleLabel }) {
  const inputFingerprint = createRunFingerprint(routeId, vehicleLabel);
  const existing = await findReplay(driverId, operationId, inputFingerprint);
  if (existing) return existing;
  try {
    return await transaction((session) => createRunInTransaction({
      session, driverId, routeId, operationId, inputFingerprint, vehicleLabel,
    }));
  } catch (error) {
    if (error.code === 11000) {
      const replay = await findReplay(driverId, operationId, inputFingerprint);
      if (replay) return replay;
      throw conflict('ACTIVE_TRIP_EXISTS', 'Driver already has an active run');
    }
    throw error;
  }
}

async function createRunInTransaction({
  session, driverId, routeId, operationId, inputFingerprint, vehicleLabel,
}) {
  const replay = await findReplay(driverId, operationId, inputFingerprint, session);
  if (replay) return replay;
  const profile = await eligibleInSession(driverId, session);
  const current = await Trip.exists({ driver: driverId, driverActive: true }).session(session);
  if (current) throw conflict('ACTIVE_TRIP_EXISTS', 'Driver already has an active run');
  const route = await touchActiveRoute(routeId, session);
  if (!route) throw new ApiError(404, 'Route not found', { code: 'ROUTE_NOT_FOUND' });
  const catalog = routeCatalogDisplay(route);
  const occurredAt = new Date();
  const [trip] = await Trip.create([{
    driver: driverId, route: route._id, routeOrigin: route.origin,
    routeDestination: route.destination, fareMinor: route.defaultFareMinor,
    currency: route.currency, estimatedDurationMinutes: route.estimatedDurationMinutes,
    lineLabel: catalog.lineLabel,
    distanceMeters: catalog.distanceMeters,
    vehicleLabel: vehicleLabel ?? null,
    vehicleSnapshot: { description: profile.vehicleDescription },
    status: 'in_progress', startedAt: occurredAt, driverActive: true, revision: 0,
  }], { session });
  const reply = { trip: toPublicDriverTrip(trip), replayed: false, occurredAt };
  await recordDriverEvent({ session, driverId, tripId: trip._id, operationId,
    inputFingerprint, actionType: 'trip_created', resultingStatus: 'in_progress',
    reply, occurredAt });
  return reply;
}

async function currentRun(driverId) {
  const trip = await Trip.findOne({ driver: driverId, driverActive: true, isDeleted: false })
    .sort({ createdAt: -1, _id: -1 }).lean();
  return { trip: trip ? toPublicDriverTrip(trip) : null };
}

async function ownedRun(driverId, tripId) {
  const trip = await Trip.findOne({ _id: tripId, driver: driverId, isDeleted: false }).lean();
  if (!trip) throw new ApiError(404, 'Trip not found', { code: 'TRIP_NOT_FOUND' });
  return { trip: toPublicDriverTrip(trip) };
}

const TRANSITIONS = {
  complete: { actionType: 'trip_completed', from: ['boarding', 'in_progress'], to: 'completed' },
};

function matchesFromStatus(rule, status) {
  return Array.isArray(rule.from) ? rule.from.includes(status) : rule.from === status;
}

function expectedEarningSnapshot(calculation, driverId, trip) {
  return {
    driver: driverId,
    trip: trip._id,
    ticketCount: calculation.ticketCount,
    grossMinor: calculation.grossMinor,
    platformFeeMinor: calculation.platformFeeMinor,
    netMinor: calculation.netMinor,
    currency: calculation.currency,
    status: calculation.status,
    periodKey: calculation.periodKey,
    routeOrigin: trip.routeOrigin,
    routeDestination: trip.routeDestination,
    policyVersion: calculation.policyVersion,
    feeBasisPoints: calculation.feeBasisPoints,
    trigger: calculation.trigger,
    paymentTreatment: calculation.paymentTreatment,
    accruedAt: calculation.accruedAt,
  };
}

async function transitionRun(driverId, tripId, action, operationId) {
  const rule = TRANSITIONS[action];
  const inputFingerprint = lifecycleFingerprint(rule.actionType, tripId);
  const existing = await findReplay(driverId, operationId, inputFingerprint);
  if (existing) return existing;
  let attempt = 0;
  while (true) {
    try {
      return await transaction((session) => transitionInTransaction({
        session, driverId, tripId, action, rule, operationId, inputFingerprint,
      }));
    } catch (error) {
      if (error.code === 11000) {
        const replay = await findReplay(driverId, operationId, inputFingerprint);
        if (replay) return replay;
        if (action === 'complete') {
          throw conflict('EARNING_CONFLICT', 'An incompatible earning already exists for this trip');
        }
        throw conflict('TRIP_STATE_CONFLICT', 'Trip changed during operation');
      }
      const revisionConflict = error?.details?.code === 'TRIP_STATE_CONFLICT';
      const canRetry = action === 'complete'
        && attempt < MAX_COMPLETION_RETRIES
        && (isTransientTransactionError(error) || revisionConflict);
      if (canRetry) {
        const trip = await Trip.findOne({ _id: tripId, driver: driverId }).lean();
        if (['boarding', 'in_progress'].includes(trip?.status) && trip.driverActive) {
          attempt += 1;
          continue;
        }
      }
      throw error;
    }
  }
}

function assertTransitionAllowed(trip, rule, action) {
  if (!matchesFromStatus(rule, trip.status) || !trip.driverActive) {
    throw conflict('TRIP_STATE_CONFLICT', 'Trip state does not allow this action');
  }
  if (!Number.isSafeInteger(trip.revision) || trip.revision >= MAX_SAFE) {
    throw conflict('TRIP_STATE_CONFLICT', 'Trip revision is unavailable');
  }
  if (action === 'complete' && trip.status === 'in_progress' && !trip.startedAt) {
    throw conflict('TRIP_STATE_CONFLICT', 'Trip has no start time');
  }
}

function transitionWrite(trip, driverId, rule, action, occurredAt) {
  const fromStatus = Array.isArray(rule.from) ? { $in: rule.from } : rule.from;
  const filter = { _id: trip._id, driver: driverId, isDeleted: false,
    driverActive: true, status: fromStatus, revision: trip.revision };
  const startedAt = trip.startedAt || occurredAt;
  const update = { $set: { status: rule.to }, $inc: { revision: 1 } };
  if (action === 'complete') {
    update.$set.startedAt = startedAt;
    update.$set.completedAt = occurredAt < startedAt ? startedAt : occurredAt;
    update.$set.driverActive = false;
  }
  return { filter, update };
}

async function incrementCompletedTrips(driverId, session) {
  const incremented = await DriverProfile.updateOne(
    { user: driverId, $or: [
      { totalTrips: { $exists: false } }, { totalTrips: { $lt: MAX_SAFE } },
    ] },
    { $inc: { totalTrips: 1 } }, { session }
  );
  if (incremented.matchedCount !== 1) {
    throw conflict('TRIP_STATE_CONFLICT', 'Driver trip total unavailable');
  }
}

async function transitionInTransaction({ session, driverId, tripId, action,
  rule, operationId, inputFingerprint }) {
  const replay = await findReplay(driverId, operationId, inputFingerprint, session);
  if (replay) return replay;
  await eligibleInSession(driverId, session);
  const trip = await Trip.findOne({ _id: tripId, driver: driverId, isDeleted: false }).session(session);
  if (!trip) throw new ApiError(404, 'Trip not found', { code: 'TRIP_NOT_FOUND' });
  assertTransitionAllowed(trip, rule, action);
  const occurredAt = new Date();
  const startedAt = trip.startedAt || occurredAt;
  let calculation = null;
  if (action === 'complete') {
    const usedTickets = await Ticket.find({ trip: trip._id, status: 'used' })
      .select('_id fareMinor currency status trip')
      .session(session)
      .lean();
    calculation = calculateEarning({
      tickets: usedTickets,
      ticketsUsed: trip.stats?.ticketsUsed,
      completedAt: occurredAt < startedAt ? startedAt : occurredAt,
      tripId: trip._id,
    });
    if (calculation) {
      const existing = await Earning.findOne({ trip: trip._id }).session(session).lean();
      if (existing) {
        if (!earningSnapshotsMatch(existing, expectedEarningSnapshot(calculation, driverId, trip))) {
          throw conflict('EARNING_CONFLICT', 'An incompatible earning already exists for this trip');
        }
      } else {
        if (writeBarriers.beforeEarningCreate) await writeBarriers.beforeEarningCreate();
        try {
          await Earning.create([{
            trip: trip._id,
            driver: driverId,
            routeOrigin: trip.routeOrigin,
            routeDestination: trip.routeDestination,
            currency: calculation.currency,
            ticketCount: calculation.ticketCount,
            grossMinor: calculation.grossMinor,
            platformFeeMinor: calculation.platformFeeMinor,
            netMinor: calculation.netMinor,
            feeBasisPoints: calculation.feeBasisPoints,
            status: calculation.status,
            accruedAt: calculation.accruedAt,
            periodKey: calculation.periodKey,
            policyVersion: calculation.policyVersion,
            trigger: calculation.trigger,
            paymentTreatment: calculation.paymentTreatment,
          }], { session });
        } catch (error) {
          if (error.code !== 11000) throw error;
          throw conflict('EARNING_CONFLICT', 'An incompatible earning already exists for this trip');
        }
      }
    }
  }
  if (writeBarriers.beforeTripWrite) await writeBarriers.beforeTripWrite();
  const { filter, update } = transitionWrite(trip, driverId, rule, action, occurredAt);
  const changed = await Trip.findOneAndUpdate(filter, update, { session, returnDocument: 'after' });
  if (!changed) throw conflict('TRIP_STATE_CONFLICT', 'Trip changed during operation');
  if (action === 'complete') {
    if (writeBarriers.beforeDriverCount) await writeBarriers.beforeDriverCount();
    await incrementCompletedTrips(driverId, session);
  }
  const reply = { trip: toPublicDriverTrip(changed), replayed: false, occurredAt };
  if (writeBarriers.beforeEventWrite) await writeBarriers.beforeEventWrite();
  await recordDriverEvent({ session, driverId, tripId: trip._id, operationId,
    inputFingerprint, actionType: rule.actionType, resultingStatus: rule.to, reply, occurredAt });
  return reply;
}

function toPublicDriverTrip(trip) {
  const journey = runJourneyDisplay(trip);
  return {
    id: String(trip._id),
    routeId: String(trip.route),
    origin: trip.routeOrigin,
    destination: trip.routeDestination,
    lineLabel: journey.lineLabel,
    distanceMeters: journey.distanceMeters,
    vehicleLabel: journey.vehicleLabel,
    fareMinor: trip.fareMinor,
    currency: trip.currency,
    estimatedDurationMinutes: trip.estimatedDurationMinutes,
    vehicle: { description: trip.vehicleSnapshot?.description ?? null },
    status: trip.status,
    startedAt: trip.startedAt ?? null,
    completedAt: trip.completedAt ?? null,
    stats: {
      ticketsIssued: trip.stats?.ticketsIssued ?? 0,
      ticketsUsed: trip.stats?.ticketsUsed ?? 0,
      ticketsCancelled: trip.stats?.ticketsCancelled ?? 0,
    },
    allowedActions: allowedActions(trip),
  };
}

module.exports = {
  listRoutes,
  createRun,
  currentRun,
  ownedRun,
  transitionRun,
  setWriteBarriers,
  toPublicDriverTrip,
};
