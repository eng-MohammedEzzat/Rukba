'use strict';

const { Route, SavedRoute } = require('../../models');
const ApiError = require('../../utils/shared/ApiError');
const { parsePagination, paginationMeta } = require('../../utils/shared/pagination');
const { routeCatalogDisplay } = require('../../utils/trip/journeyDisplay');

function snapshotFromRoute(route) {
  const display = routeCatalogDisplay(route);
  return {
    origin: route.origin,
    destination: route.destination,
    lineLabel: display.lineLabel,
    distanceMeters: display.distanceMeters,
    defaultFareMinor: route.defaultFareMinor,
    currency: route.currency,
    estimatedDurationMinutes: route.estimatedDurationMinutes,
  };
}

async function loadActiveRoute(routeId) {
  const route = await Route.findOne({ _id: routeId, isActive: true }).lean();
  if (!route) {
    throw new ApiError(404, 'Route not found', { code: 'ROUTE_NOT_FOUND' });
  }
  return route;
}

async function saveRoute(passengerId, routeId) {
  const route = await loadActiveRoute(routeId);
  const snapshot = snapshotFromRoute(route);

  try {
    const created = await SavedRoute.create({
      passenger: passengerId,
      route: route._id,
      ...snapshot,
    });
    return {
      savedRoute: toPublicSavedRoute(created.toObject(), { routeAvailable: true }),
      created: true,
    };
  } catch (err) {
    if (err?.code !== 11000) {
      throw err;
    }
    const existing = await SavedRoute.findOne({
      passenger: passengerId,
      route: routeId,
    }).lean();
    if (!existing) {
      throw err;
    }
    return {
      savedRoute: toPublicSavedRoute(existing, { routeAvailable: true }),
      created: false,
    };
  }
}

async function listSavedRoutes(passengerId, query = {}) {
  const pagination = parsePagination(query);
  const filter = { passenger: passengerId };

  const [total, rows] = await Promise.all([
    SavedRoute.countDocuments(filter),
    SavedRoute.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
  ]);

  const routeIds = rows.map((row) => row.route).filter(Boolean);
  const activeRoutes = routeIds.length
    ? await Route.find({ _id: { $in: routeIds }, isActive: true })
        .select('_id')
        .lean()
    : [];
  const activeIds = new Set(activeRoutes.map((route) => String(route._id)));

  return {
    savedRoutes: rows.map((row) =>
      toPublicSavedRoute(row, {
        routeAvailable: activeIds.has(String(row.route)),
      })
    ),
    meta: paginationMeta({ ...pagination, total }),
  };
}

async function removeSavedRoute(passengerId, routeId) {
  const removed = await SavedRoute.findOneAndDelete({
    passenger: passengerId,
    route: routeId,
  }).lean();

  if (!removed) {
    throw new ApiError(404, 'Saved route not found', {
      code: 'SAVED_ROUTE_NOT_FOUND',
    });
  }

  return toPublicSavedRoute(removed, { routeAvailable: null });
}

function toPublicSavedRoute(doc, { routeAvailable = null } = {}) {
  const routeId =
    doc.route && typeof doc.route === 'object' && doc.route._id
      ? doc.route._id
      : doc.route;

  return {
    id: String(doc._id),
    routeId: routeId ? String(routeId) : null,
    origin: doc.origin ?? null,
    destination: doc.destination ?? null,
    lineLabel: doc.lineLabel ?? null,
    distanceMeters: doc.distanceMeters ?? null,
    defaultFareMinor: doc.defaultFareMinor ?? null,
    currency: doc.currency ?? null,
    estimatedDurationMinutes: doc.estimatedDurationMinutes ?? null,
    routeAvailable: typeof routeAvailable === 'boolean' ? routeAvailable : null,
    savedAt: doc.createdAt ?? null,
  };
}

module.exports = {
  saveRoute,
  listSavedRoutes,
  removeSavedRoute,
};
