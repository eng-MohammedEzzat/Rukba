'use strict';

const apiResponse = require('../../utils/shared/apiResponse');
const asyncHandler = require('../../utils/shared/asyncHandler');
const savedRouteService = require('../../services/Passenger/savedRoute.service');

const saveRoute = asyncHandler(async (req, res) => {
  const result = await savedRouteService.saveRoute(req.user._id, req.body.routeId);
  return apiResponse(res, {
    statusCode: result.created ? 201 : 200,
    message: result.created ? 'Route saved' : 'Route already saved',
    data: {
      savedRoute: result.savedRoute,
      created: result.created,
    },
  });
});

const listSavedRoutes = asyncHandler(async (req, res) => {
  const data = await savedRouteService.listSavedRoutes(
    req.user._id,
    req.validatedQuery || {}
  );
  return apiResponse(res, {
    message: 'OK',
    data,
  });
});

const removeSavedRoute = asyncHandler(async (req, res) => {
  const savedRoute = await savedRouteService.removeSavedRoute(
    req.user._id,
    req.params.routeId
  );
  return apiResponse(res, {
    message: 'Saved route removed',
    data: { savedRoute },
  });
});

module.exports = {
  saveRoute,
  listSavedRoutes,
  removeSavedRoute,
};
