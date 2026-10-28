'use strict';

const mongoose = require('mongoose');
const env = require('../../config/env');
const { Trip, Earning } = require('../../models');
const ApiError = require('../../utils/shared/ApiError');
const isTransientTransactionError = require('../../utils/shared/isTransientTransactionError');
const {
  deploymentSupportsTransactions,
  runInTransaction,
} = require('../../utils/shared/runInTransaction');
const { isEligibleDriver } = require('../../utils/trip/driverTripEligibility');
const { gazaOperatingDay } = require('../../utils/Driver/gazaDayBounds');
const {
  classifyEarning,
  summarizeTotals,
  emptyTotals,
} = require('../../utils/Driver/earningIntegrity');
const { duplicateTripIds, loadTripOwners } = require('../../utils/Driver/earningScope');

const RECENT_TRIP_CAP = 5;
const MAX_TRANSIENT_RETRIES = 2;
const MAX_SAFE = Number.MAX_SAFE_INTEGER;

function unavailable() {
  return new ApiError(503, 'Driver home is temporarily unavailable', {
    code: 'TEMPORARILY_UNAVAILABLE',
  });
}

function ownerId(driverId) {
  return new mongoose.Types.ObjectId(String(driverId));
}

async function assertEligible(db, driverId, session) {
  const user = await db.collection('users').findOne({ _id: ownerId(driverId) }, { session });
  const profile = await db.collection('driverprofiles').findOne(
    { user: ownerId(driverId) },
    { session }
  );
  if (!isEligibleDriver(user, profile)) {
    throw new ApiError(403, 'Driver is not eligible to operate', { code: 'DRIVER_INELIGIBLE' });
  }
}

async function countCompletedToday(driverId, day, session) {
  return Trip.countDocuments({
    driver: ownerId(driverId),
    status: 'completed',
    isDeleted: { $ne: true },
    completedAt: { $gte: day.startAt, $lt: day.endAt },
  }).session(session);
}

async function listRecentCompletedTrips(driverId, session) {
  const trips = await Trip.find({
    driver: ownerId(driverId),
    status: 'completed',
    isDeleted: { $ne: true },
  })
    .sort({ completedAt: -1, _id: -1 })
    .limit(RECENT_TRIP_CAP)
    .select('routeOrigin routeDestination completedAt status fareMinor currency')
    .session(session)
    .lean();

  return trips.map((trip) => ({
    id: String(trip._id),
    origin: trip.routeOrigin,
    destination: trip.routeDestination,
    completedAt: trip.completedAt ? new Date(trip.completedAt).toISOString() : null,
    status: trip.status,
    fareMinor: trip.fareMinor,
    currency: trip.currency,
  }));
}

function todayEarnedNet(classified) {
  const summarized = classified.length ? summarizeTotals(classified) : {
    totals: emptyTotals(),
    warnings: [],
  };
  const usable = classified.filter((classifiedEarning) => classifiedEarning.usable);
  const amountPoisoned = usable.some((classifiedEarning) => !classifiedEarning.moneyOk);
  let netMinor = 0;
  let overflow = false;
  for (const classifiedEarning of usable) {
    if (!classifiedEarning.moneyOk) continue;
    const next = netMinor + classifiedEarning.amounts.netMinor;
    if (next > MAX_SAFE) {
      overflow = true;
      break;
    }
    netMinor = next;
  }
  return {
    earnedNetMinor: amountPoisoned || overflow ? null : netMinor,
    warnings: summarized.warnings,
  };
}

async function sumTodayEarnings(driverId, day, session) {
  const db = mongoose.connection.db;
  const rows = await Earning.find({
    driver: ownerId(driverId),
    accruedAt: { $gte: day.startAt, $lt: day.endAt },
  }).session(session).lean();
  const tripOwners = await loadTripOwners(db, rows, session);
  const duplicates = await duplicateTripIds(db, rows, session);
  const classified = rows.map((row) => classifyEarning(row, {
    ownerId: driverId,
    duplicateTripIds: duplicates,
    tripOwners,
  }));
  return todayEarnedNet(classified);
}

async function readHome(session, driverId, now) {
  await assertEligible(mongoose.connection.db, driverId, session);
  const day = gazaOperatingDay(now);
  const completedTripCount = await countCompletedToday(driverId, day, session);
  const earnings = await sumTodayEarnings(driverId, day, session);
  const recentTrips = await listRecentCompletedTrips(driverId, session);
  return {
    today: {
      date: day.date,
      timezone: day.timezone,
      startAt: day.startAt.toISOString(),
      endAt: day.endAt.toISOString(),
      completedTripCount,
      earnedNetMinor: earnings.earnedNetMinor,
      currency: 'ILS',
      integrityWarnings: earnings.warnings,
    },
    recentTrips,
  };
}

async function getDriverHome(driverId, now = new Date()) {
  if (!(await deploymentSupportsTransactions())) {
    return runInTransaction((session) => readHome(session, driverId, now));
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
      const homeSnapshot = await readHome(session, driverId, now);
      await session.commitTransaction();
      return homeSnapshot;
    } catch (err) {
      try {
        await session.abortTransaction();
      } catch {
        // Session already closed or never started.
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

module.exports = { getDriverHome };
