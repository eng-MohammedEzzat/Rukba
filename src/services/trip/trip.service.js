'use strict';

const mongoose = require('mongoose');
const { Route, Trip, Ticket, ActionHistory } = require('../../models');
const ApiError = require('../../utils/shared/ApiError');
const { parsePagination, paginationMeta } = require('../../utils/shared/pagination');
const { toPublicRoute } = require('./route.service');
const { isTripBookable, buildBookableFilter } = require('../../utils/trip/tripEligibility');
const { runJourneyDisplay } = require('../../utils/trip/journeyDisplay');
const {
  buildHistoryGroups,
  bookedJourneyFromReceipt,
} = require('../../utils/trip/tripHistory');

const ROUTE_POPULATE =
  'origin destination defaultFareMinor currency estimatedDurationMinutes isActive lineLabel distanceMeters';

async function resolveRouteId({ routeId, origin, destination }) {
  if (routeId) {
    const route = await Route.findOne({ _id: routeId, isActive: true })
      .select('_id')
      .lean();
    return route ? route._id : null;
  }

  const route = await Route.findOne({
    origin,
    destination,
    isActive: true,
  })
    .select('_id')
    .lean();
  return route ? route._id : null;
}

function emptyPage(pagination) {
  return {
    trips: [],
    meta: paginationMeta({ ...pagination, total: 0 }),
  };
}

async function resolveSearchRoutes(query) {
  const hasRouteCriterion = Boolean(
    query.routeId || (query.origin && query.destination)
  );
  if (hasRouteCriterion) {
    const routeId = await resolveRouteId(query);
    return routeId ? { routeId } : null;
  }
  const routeIds = await Route.find({ isActive: true }).distinct('_id');
  return routeIds.length ? { routeIds } : null;
}

async function searchTrips(query = {}) {
  const pagination = parsePagination(query, { maxLimit: 100 });
  const routes = await resolveSearchRoutes(query);
  if (!routes) {
    return emptyPage(pagination);
  }

  const filter = buildBookableFilter(routes);
  const sort = routes.routeId
    ? { fareMinor: 1, _id: 1 }
    : { routeOrigin: 1, routeDestination: 1, fareMinor: 1, _id: 1 };

  const [total, trips] = await Promise.all([
    Trip.countDocuments(filter),
    Trip.find(filter)
      .sort(sort)
      .skip(pagination.skip)
      .limit(pagination.limit)
      .populate('route', ROUTE_POPULATE)
      .populate('driver', 'fullName image.url')
      .lean(),
  ]);

  return {
    trips: trips.map(toPublicTrip),
    meta: paginationMeta({ ...pagination, total }),
  };
}

async function getTripById(tripId) {
  const trip = await Trip.findOne({ _id: tripId, isDeleted: false })
    .populate('route', ROUTE_POPULATE)
    .populate('driver', 'fullName image.url')
    .lean();

  if (!trip) {
    throw new ApiError(404, 'Trip not found');
  }

  return toPublicTrip(trip);
}

function toObjectId(value) {
  if (value instanceof mongoose.Types.ObjectId) {
    return value;
  }
  return new mongoose.Types.ObjectId(String(value));
}

function missingTripStub(tripId) {
  return {
    id: tripId,
    route: null,
    driver: null,
    fareMinor: null,
    currency: null,
    estimatedDurationMinutes: null,
    lineLabel: null,
    distanceMeters: null,
    vehicleLabel: null,
    status: null,
    isBookable: false,
    startedAt: null,
    completedAt: null,
    createdAt: null,
    updatedAt: null,
  };
}

/**
 * Past journeys the passenger took (used tickets), distinct by original trip id.
 * Orders by latest known validation.scannedAt; unknown times sort after known ones.
 * Missing or soft-deleted trips remain visible with unavailable current details.
 */
async function listTripHistory(passengerId, query) {
  const pagination = parsePagination(query);
  const passengerOid = toObjectId(passengerId);

  const usedTickets = await Ticket.find({
    passenger: passengerOid,
    status: 'used',
  })
    .select('_id trip fareMinor currency validation.scannedAt')
    .lean();

  if (!usedTickets.length) {
    return emptyPage(pagination);
  }

  const groups = buildHistoryGroups(usedTickets);
  const total = groups.length;
  const page = groups.slice(
    pagination.skip,
    pagination.skip + pagination.limit
  );

  const tripIds = page.map((g) => toObjectId(g.tripId));
  const ticketIds = page.map((g) => g.representative._id);

  const [trips, receipts] = await Promise.all([
    Trip.find({ _id: { $in: tripIds } })
      .populate('route', ROUTE_POPULATE)
      .populate('driver', 'fullName image.url')
      .lean(),
    ActionHistory.find({
      ticket: { $in: ticketIds },
      actionType: 'ticket_booked',
    }).lean(),
  ]);

  const tripById = new Map(trips.map((t) => [String(t._id), t]));
  const receiptsByTicket = new Map();
  for (const event of receipts) {
    const key = String(event.ticket);
    if (!receiptsByTicket.has(key)) {
      receiptsByTicket.set(key, []);
    }
    receiptsByTicket.get(key).push(event);
  }

  const historyTrips = page.map((group) => {
    const trip = tripById.get(group.tripId);
    const currentDetailsStatus =
      trip && trip.isDeleted !== true ? 'available' : 'unavailable';

    const receiptEvents =
      receiptsByTicket.get(String(group.representative._id)) || [];
    const receipt =
      receiptEvents.length === 1 && receiptEvents[0].receipt
        ? receiptEvents[0].receipt
        : null;

    const base =
      currentDetailsStatus === 'available'
        ? toPublicTrip(trip)
        : missingTripStub(group.tripId);

    return {
      ...base,
      lastUsedAt: group.lastUsedAt,
      usageTimeStatus: group.lastUsedAt ? 'known' : 'unknown',
      currentDetailsStatus,
      bookedJourney: bookedJourneyFromReceipt(receipt, group.representative),
    };
  });

  return {
    trips: historyTrips,
    meta: paginationMeta({ ...pagination, total }),
  };
}

function toPublicTripDriver(driver) {
  if (!driver) return null;
  return {
    id: driver._id,
    fullName: driver.fullName,
    image: driver.image ? { url: driver.image.url } : null,
  };
}

function toPublicTrip(trip) {
  const route =
    trip.route && typeof trip.route === 'object' && trip.route.origin
      ? toPublicRoute(trip.route)
      : trip.route
        ? { id: trip.route }
        : null;

  const driver =
    trip.driver && typeof trip.driver === 'object' && trip.driver.fullName !== undefined
      ? toPublicTripDriver(trip.driver)
      : trip.driver
        ? { id: trip.driver }
        : null;

  const journey = runJourneyDisplay(trip);

  return {
    id: trip._id,
    route: route && {
      ...route,
      origin: trip.routeOrigin ?? route.origin,
      destination: trip.routeDestination ?? route.destination,
      lineLabel: journey.lineLabel,
      distanceMeters: journey.distanceMeters,
    },
    driver,
    vehicle: trip.vehicleSnapshot?.description
      ? { description: trip.vehicleSnapshot.description }
      : null,
    lineLabel: journey.lineLabel,
    distanceMeters: journey.distanceMeters,
    vehicleLabel: journey.vehicleLabel,
    fareMinor: trip.fareMinor,
    currency: trip.currency,
    estimatedDurationMinutes: trip.estimatedDurationMinutes,
    status: trip.status,
    isBookable: isTripBookable(trip),
    startedAt: trip.startedAt,
    completedAt: trip.completedAt,
    createdAt: trip.createdAt,
    updatedAt: trip.updatedAt,
  };
}

module.exports = {
  searchTrips,
  getTripById,
  listTripHistory,
  toPublicTrip,
};
