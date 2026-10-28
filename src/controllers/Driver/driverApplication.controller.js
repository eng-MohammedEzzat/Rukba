'use strict';

const apiResponse = require('../../utils/shared/apiResponse');
const asyncHandler = require('../../utils/shared/asyncHandler');
const driverApplicationService = require('../../services/Driver/driverApplication.service');

const listApplications = asyncHandler(async (req, res) => {
  const applications = await driverApplicationService.listApplications(req.validatedQuery);
  return apiResponse(res, { message: 'Driver applications', data: applications });
});

const getApplication = asyncHandler(async (req, res) => {
  const application = await driverApplicationService.getApplication(req.params.applicationId);
  return apiResponse(res, { message: 'Driver application', data: application });
});

const decideApplication = asyncHandler(async (req, res) => {
  const decision = await driverApplicationService.decideApplication(
    req.params.applicationId,
    req.user._id,
    req.body
  );
  return apiResponse(res, { message: 'Driver application decided', data: decision });
});

module.exports = { listApplications, getApplication, decideApplication };
