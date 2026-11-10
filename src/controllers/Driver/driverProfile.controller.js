'use strict';

const apiResponse = require('../../utils/shared/apiResponse');
const asyncHandler = require('../../utils/shared/asyncHandler');
const driverProfileService = require('../../services/Driver/driverProfile.service');

const getProfile = asyncHandler(async (req, res) => {
  const driverProfile = await driverProfileService.getDriverProfile(req.user);
  return apiResponse(res, { message: 'الملف الشخصي للسائق', data: driverProfile });
});

const updateProfile = asyncHandler(async (req, res) => {
  const driverProfile = await driverProfileService.updateDriverProfile(
    req.user,
    req.body,
    req.file
  );
  return apiResponse(res, { message: 'تم تحديث الملف الشخصي للسائق', data: driverProfile });
});

module.exports = { getProfile, updateProfile };
