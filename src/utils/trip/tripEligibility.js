'use strict';

const LEGACY_BOOKABLE_STATUSES = Object.freeze(['boarding', 'scheduled']);
const BOOKABLE_STATUSES = Object.freeze([...LEGACY_BOOKABLE_STATUSES, 'in_progress']);

function buildBookableFilter({ routeId, routeIds } = {}) {
  const filter = {
    isDeleted: false,
    $or: [
      { status: { $in: [...LEGACY_BOOKABLE_STATUSES] }, startedAt: null },
      { status: 'in_progress', driverActive: true, completedAt: null },
    ],
  };

  if (routeId) {
    filter.route = routeId;
  } else if (routeIds) {
    filter.route = { $in: routeIds };
  }

  return filter;
}

function isPopulatedRoute(route) {
  return Boolean(route && typeof route === 'object' && 'isActive' in route);
}

function isTripBookable(trip) {
  if (!trip || trip.isDeleted === true) {
    return false;
  }
  if (isPopulatedRoute(trip.route) && trip.route.isActive === false) {
    return false;
  }
  if (trip.status === 'in_progress') {
    return Boolean(trip.driverActive) && !trip.completedAt;
  }
  if (!LEGACY_BOOKABLE_STATUSES.includes(trip.status)) {
    return false;
  }
  if (trip.startedAt) {
    return false;
  }
  return true;
}

module.exports = {
  BOOKABLE_STATUSES,
  buildBookableFilter,
  isTripBookable,
};
