'use strict';

const apiResponse = require('../../utils/shared/apiResponse');
const asyncHandler = require('../../utils/shared/asyncHandler');
const homeService = require('../../services/Passenger/home.service');

const getHome = asyncHandler(async (req, res) => {
  const homeData = await homeService.getHomeData(req.user);
  return apiResponse(res, {
    message: 'OK',
    data: homeData,
  });
});

module.exports = { getHome };
