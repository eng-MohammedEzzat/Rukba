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

const createRoutes=asyncHandler(async(req,res)=>{
  const route = await routeService.createRoutes(req.body)
  
  return apiResponse(res,{
    message: 'تم إنشاء خط السير بنجاح',
    data:{route}
  });
}); 

const getRoute = asyncHandler(async (req, res) => {
  const route = await routeService.getActiveRouteById(req.params.routeId);

  return apiResponse(res, {
    message: 'تمت العملية بنجاح',
    data: { route },
  });
});

module.exports = { listRoutes, getRoute,createRoutes };
