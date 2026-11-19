'use strict';

const apiResponse = require('../../utils/shared/apiResponse');
const asyncHandler = require('../../utils/shared/asyncHandler');
const routeService = require('../../services/trip/route.service');

const listRoutes = asyncHandler(async (req, res) => {
  const routes = await routeService.listActiveRoutes(req.validatedQuery || {});

  return apiResponse(res, {
    message: 'تمت العملية بنجاح',
    data: { routes },
  });
});

const createRoute = asyncHandler(async (req, res) => {
  const route = await routeService.createRoute(req.body);

  return apiResponse(res, {
    statusCode: 201,
    message: 'تم إنشاء خط السير بنجاح',
    data: { route },
  });
});

const listAdminRoutes = asyncHandler(async (req, res) => {
  const routePage = await routeService.listAdminRoutes(req.validatedQuery);

  return apiResponse(res, {
    message: 'تمت العملية بنجاح',
    data: routePage,
  });
});

const getAdminRoute = asyncHandler(async (req, res) => {
  const route = await routeService.getAdminRouteById(req.params.routeId);

  return apiResponse(res, {
    message: 'تمت العملية بنجاح',
    data: { route },
  });
});

const updateRoute = asyncHandler(async (req, res) => {
  const route = await routeService.updateRoute(req.params.routeId, req.body);

  return apiResponse(res, {
    message: 'تم تعديل خط السير بنجاح',
    data: { route },
  });
});

const getRoute = asyncHandler(async (req, res) => {
  const route = await routeService.getActiveRouteById(req.params.routeId);

  return apiResponse(res, {
    message: 'تمت العملية بنجاح',
    data: { route },
  });
});

module.exports = { listRoutes, getRoute, createRoute, listAdminRoutes, getAdminRoute, updateRoute };
