'use strict';

const apiResponse = require('../../utils/shared/apiResponse');
const asyncHandler = require('../../utils/shared/asyncHandler');
const driverProfileService = require('../../services/Driver/driverProfile.service');

const getProfile = asyncHandler(async (req, res) => {
  const driverProfile = await driverProfileService.getDriverProfile(req.user);
  return apiResponse(res, { message: 'Driver profile', data: driverProfile });
});

const updateProfile = asyncHandler(async (req, res) => {
  const driverProfile = await driverProfileService.updateDriverFullName(
    req.user._id,
    req.body.fullName
  );
  return apiResponse(res, { message: 'Driver profile updated', data: driverProfile });
});

module.exports = { getProfile, updateProfile };
