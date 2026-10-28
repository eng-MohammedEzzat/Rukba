'use strict';

const { DriverProfile } = require('../../models');
const ApiError = require('../../utils/shared/ApiError');
const asyncHandler = require('../../utils/shared/asyncHandler');
const { isEligibleDriver } = require('../../utils/trip/driverTripEligibility');

const requireEligibleDriver = asyncHandler(async (req, _res, next) => {
  const profile = await DriverProfile.findOne({ user: req.user._id });
  if (!isEligibleDriver(req.user, profile)) {
    throw new ApiError(403, 'Driver is not eligible to operate', { code: 'DRIVER_INELIGIBLE' });
  }
  req.driverProfile = profile;
  next();
});

module.exports = requireEligibleDriver;
