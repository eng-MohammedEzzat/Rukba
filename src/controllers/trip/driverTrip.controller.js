'use strict';

const apiResponse = require('../../utils/shared/apiResponse');
const asyncHandler = require('../../utils/shared/asyncHandler');
const driverTripService = require('../../services/trip/driverTrip.service');

const listRoutes = asyncHandler(async (req, res) =>
  apiResponse(res, { data: await driverTripService.listRoutes(req.validatedQuery) }));

const createRun = asyncHandler(async (req, res) => {
  const tripRun = await driverTripService.createRun(req.user._id, req.body);
  return apiResponse(res, {
    statusCode: tripRun.replayed ? 200 : 201,
    message: 'Trip run created',
    data: tripRun,
  });
});

const currentRun = asyncHandler(async (req, res) =>
  apiResponse(res, { data: await driverTripService.currentRun(req.user._id) }));

const ownedRun = asyncHandler(async (req, res) =>
  apiResponse(res, {
    data: await driverTripService.ownedRun(req.user._id, req.params.tripId),
  }));

const complete = asyncHandler(async (req, res) => {
  const completedRun = await driverTripService.transitionRun(
    req.user._id,
    req.params.tripId,
    'complete',
    req.body.operationId
  );
  return apiResponse(res, { message: 'Trip run completed', data: completedRun });
});

module.exports = {
  listRoutes,
  createRun,
  currentRun,
  ownedRun,
  complete,
};
