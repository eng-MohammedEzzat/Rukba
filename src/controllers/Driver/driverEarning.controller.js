'use strict';

const apiResponse = require('../../utils/shared/apiResponse');
const asyncHandler = require('../../utils/shared/asyncHandler');
const driverEarningService = require('../../services/Driver/driverEarning.service');

const getEarnings = asyncHandler(async (req, res) => {
  const earnings = await driverEarningService.getEarnings(req.user._id, req.validatedQuery);
  return apiResponse(res, { message: 'Driver earnings retrieved', data: earnings });
});

module.exports = { getEarnings };
