'use strict';

const apiResponse = require('../../utils/shared/apiResponse');
const asyncHandler = require('../../utils/shared/asyncHandler');
const tripService = require('../../services/trip/trip.service');

const searchTrips = asyncHandler(async (req, res) => {
  const tripSearch = await tripService.searchTrips(req.validatedQuery || {});
  return apiResponse(res, {
    message: 'OK',
    data: tripSearch,
  });
});

const getTrip = asyncHandler(async (req, res) => {
  const trip = await tripService.getTripById(req.params.tripId);
  return apiResponse(res, {
    message: 'OK',
    data: { trip },
  });
});

const listHistory = asyncHandler(async (req, res) => {
  const tripHistory = await tripService.listTripHistory(
    req.user._id,
    req.validatedQuery || {}
  );
  return apiResponse(res, {
    message: 'OK',
    data: tripHistory,
  });
});

module.exports = {
  searchTrips,
  getTrip,
  listHistory,
};
