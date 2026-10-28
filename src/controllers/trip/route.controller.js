'use strict';

const apiResponse = require('../../utils/shared/apiResponse');
const asyncHandler = require('../../utils/shared/asyncHandler');
const routeService = require('../../services/trip/route.service');

const listRoutes = asyncHandler(async (req, res) => {
  const routes = await routeService.listActiveRoutes(req.validatedQuery || {});

  return apiResponse(res, {
    message: 'OK',
    data: { routes },
  });
});

const createRoutes=asyncHandler(async(req,res)=>{
  const route = await routeService.createRoutes(req.body)
  
  return apiResponse(res,{
    message:"route created successfully",
    data:{route}
  });
}); 

const getRoute = asyncHandler(async (req, res) => {
  const route = await routeService.getActiveRouteById(req.params.routeId);

  return apiResponse(res, {
    message: 'OK',
    data: { route },
  });
});

module.exports = { listRoutes, getRoute,createRoutes };
