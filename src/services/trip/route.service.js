'use strict';

const { Route } = require('../../models');
const ApiError = require('../../utils/shared/ApiError');
const { routeCatalogDisplay } = require('../../utils/trip/journeyDisplay');

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

async function createRoutes(data){
  const {origin,destination,defaultFareMinor,estimatedDurationMinutes}=data;
  const route=await Route.create({
    origin,
    destination,
    defaultFareMinor,
    estimatedDurationMinutes,
  });
  return toPublicRoute(route);
}

async function getActiveRouteById(routeId) {
  const route = await Route.findOne({ _id: routeId, isActive: true })
    .select(PUBLIC_ROUTE_FIELDS)
    .lean();

  if (!route) {
    throw new ApiError(404, 'Route not found', { code: 'ROUTE_NOT_FOUND' });
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

module.exports = { listActiveRoutes, getActiveRouteById, createRoutes, toPublicRoute };
