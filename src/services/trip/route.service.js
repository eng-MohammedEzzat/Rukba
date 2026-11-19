'use strict';

const { Route } = require('../../models');
const ApiError = require('../../utils/shared/ApiError');
const { routeCatalogDisplay } = require('../../utils/trip/journeyDisplay');
const { paginationMeta } = require('../../utils/shared/pagination');

const PUBLIC_ROUTE_FIELDS =
  'origin destination defaultFareMinor currency estimatedDurationMinutes lineLabel distanceMeters';

async function listActiveRoutes(query = {}) {
  const filter = { isActive: true };
  if (query.origin) filter.origin = query.origin;
  if (query.destination) filter.destination = query.destination;

  const routes = await Route.find(filter)
    .sort({ origin: 1, destination: 1 })
    .select(PUBLIC_ROUTE_FIELDS)
    .lean();

  return routes.map(toPublicRoute);
}

function routeNotFound() {
  return new ApiError(404, 'خط السير غير موجود', { code: 'ROUTE_NOT_FOUND' });
}

function routeAlreadyExists() {
  return new ApiError(409, 'خط السير موجود مسبقًا', { code: 'ROUTE_ALREADY_EXISTS' });
}

function sameEndpoints(route) {
  return route.origin.trim().toLowerCase() === route.destination.trim().toLowerCase();
}

function assertDifferentEndpoints(route) {
  if (sameEndpoints(route)) {
    throw new ApiError(400, 'يجب أن تختلف نقطة البداية عن الوجهة', {
      code: 'INVALID_ROUTE_ENDPOINTS',
    });
  }
}

function routeDuplicateError(error) {
  return error && error.code === 11000;
}

function routeSearchFilter(search) {
  const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return { $regex: escapedSearch, $options: 'i' };
}

function adminRouteFilter({ origin, destination, isActive, search }) {
  const filter = {};
  if (origin) filter.origin = origin;
  if (destination) filter.destination = destination;
  if (isActive !== undefined) filter.isActive = isActive;
  if (search) {
    const searchFilter = routeSearchFilter(search);
    filter.$or = [{ origin: searchFilter }, { destination: searchFilter }, { lineLabel: searchFilter }];
  }
  return filter;
}

async function listAdminRoutes({ page, limit, ...filters }) {
  const filter = adminRouteFilter(filters);
  const skip = (page - 1) * limit;
  const [routes, total] = await Promise.all([
    Route.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    Route.countDocuments(filter),
  ]);

  return {
    routes: routes.map(toAdminRoute),
    pagination: paginationMeta({ page, limit, total }),
  };
}

async function getAdminRouteById(routeId) {
  const route = await Route.findById(routeId).lean();
  if (!route) throw routeNotFound();
  return toAdminRoute(route);
}

async function createRoute(fields) {
  assertDifferentEndpoints(fields);
  try {
    const route = await Route.create(fields);
    return toAdminRoute(route);
  } catch (error) {
    if (routeDuplicateError(error)) throw routeAlreadyExists();
    throw error;
  }
}

async function updateRoute(routeId, fields) {
  const route = await Route.findById(routeId);
  if (!route) throw routeNotFound();

  route.set(fields);
  assertDifferentEndpoints(route);
  try {
    await route.save();
    return toAdminRoute(route);
  } catch (error) {
    if (routeDuplicateError(error)) throw routeAlreadyExists();
    throw error;
  }
}

async function getActiveRouteById(routeId) {
  const route = await Route.findOne({ _id: routeId, isActive: true })
    .select(PUBLIC_ROUTE_FIELDS)
    .lean();

  if (!route) {
    throw new ApiError(404, 'خط السير غير موجود', { code: 'ROUTE_NOT_FOUND' });
  }

  return toPublicRoute(route);
}

function toPublicRoute(route) {
  if (!route) return null;
  return {
    id: route._id,
    origin: route.origin,
    destination: route.destination,
    defaultFareMinor: route.defaultFareMinor,
    currency: route.currency,
    estimatedDurationMinutes: route.estimatedDurationMinutes,
    ...routeCatalogDisplay(route),
  };
}

function toAdminRoute(route) {
  if (!route) return null;
  return {
    ...toPublicRoute(route),
    isActive: route.isActive,
    bookingFence: route.bookingFence,
    createdAt: route.createdAt,
    updatedAt: route.updatedAt,
  };
}

module.exports = {
  listActiveRoutes,
  listAdminRoutes,
  getActiveRouteById,
  getAdminRouteById,
  createRoute,
  updateRoute,
  toPublicRoute,
  toAdminRoute,
};
