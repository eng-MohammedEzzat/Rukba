'use strict';

function isEligibleDriver(user, profile) {
  return Boolean(
    user && user.role === 'driver' && user.status === 'active' &&
    user.isDeleted !== true && profile &&
    profile.verificationStatus === 'verified' &&
    profile.licenseNumber?.trim() && profile.vehicleDescription?.trim()
  );
}

function ownsTrip(trip, driverId) {
  return Boolean(trip && String(trip.driver) === String(driverId));
}

function allowedActions(trip) {
  if (!trip || trip.isDeleted || !trip.driverActive || trip.completedAt) return [];
  if (trip.status === 'boarding' && !trip.startedAt) return ['complete'];
  if (trip.status === 'in_progress' && trip.startedAt) return ['complete'];
  return [];
}

module.exports = { isEligibleDriver, ownsTrip, allowedActions };
