'use strict';

const apiResponse = require('../../utils/shared/apiResponse');
const asyncHandler = require('../../utils/shared/asyncHandler');
const driverActivityService = require('../../services/Driver/driverActivity.service');

const getActivity = asyncHandler(async (req, res) => {
  const activity = await driverActivityService.getActivity(req.user._id, req.validatedQuery);
  return apiResponse(res, { message: 'Driver activity retrieved', data: activity });
});

module.exports = { getActivity };
