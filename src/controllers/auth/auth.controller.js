'use strict';

const apiResponse = require('../../utils/shared/apiResponse');
const asyncHandler = require('../../utils/shared/asyncHandler');
const clientMetadata = require('../../utils/auth/clientMetadata');
const authService = require('../../services/auth/auth.service');
const driverRegistrationService = require('../../services/auth/driverRegistration.service');
const roleAuthService = require('../../services/auth/roleAuth.service');
const sessionService = require('../../services/auth/session.service');

const registerPassenger = asyncHandler(async (req, res) => {
  const registration = await authService.registerPassenger(req.body, clientMetadata(req));
  return apiResponse(res, {
    statusCode: 201,
    message: 'Registered',
    data: registration,
  });
});

const loginPassenger = asyncHandler(async (req, res) => {
  const loginSession = await authService.loginPassenger(req.body, clientMetadata(req));
  return apiResponse(res, {
    message: 'Logged in',
    data: loginSession,
  });
});

const refreshPassengerSession = asyncHandler(async (req, res) => {
  const refreshedSession = await authService.refreshTokens(
    req.body.refreshToken,
    clientMetadata(req)
  );
  return apiResponse(res, {
    message: 'Token refreshed',
    data: refreshedSession,
  });
});

const logoutPassenger = asyncHandler(async (req, res) => {
  const logoutSession = await authService.logout(req.body.refreshToken);
  return apiResponse(res, {
    message: 'Logged out',
    data: logoutSession,
  });
});

const logoutAllPassengerSessions = asyncHandler(async (req, res) => {
  const logoutAllSessions = await authService.logoutAll(req.user._id);
  return apiResponse(res, {
    message: 'Logged out from all sessions',
    data: logoutAllSessions,
  });
});

const registerDriver = asyncHandler(async (req, res) => {
  const registration = await driverRegistrationService.registerDriver(req.body);
  return apiResponse(res, {
    statusCode: 201,
    message: 'Driver registered',
    data: registration,
  });
});

function loginRole(role) {
  return asyncHandler(async (req, res) => {
    const loginSession = await roleAuthService.loginRole(role, req.body, clientMetadata(req));
    return apiResponse(res, {
      message: 'Logged in',
      data: loginSession,
    });
  });
}

function refreshRoleSession(role) {
  return asyncHandler(async (req, res) => {
    const refreshedSession = await sessionService.rotateRoleSession(
      req.body.refreshToken,
      role,
      clientMetadata(req)
    );
    return apiResponse(res, {
      message: 'Token refreshed',
      data: refreshedSession,
    });
  });
}

function logoutRole(role) {
  return asyncHandler(async (req, res) => {
    const logoutSession = await sessionService.revokeRoleFamily(req.body.refreshToken, role);
    return apiResponse(res, {
      message: 'Logged out',
      data: logoutSession,
    });
  });
}

function logoutAllRoleSessions(role) {
  return asyncHandler(async (req, res) => {
    const logoutAllSessions = await sessionService.revokeAllRoleSessions(req.user._id, role);
    return apiResponse(res, {
      message: 'Logged out from all sessions',
      data: logoutAllSessions,
    });
  });
}

module.exports = {
  registerPassenger,
  loginPassenger,
  refreshPassengerSession,
  logoutPassenger,
  logoutAllPassengerSessions,
  registerDriver,
  loginRole,
  refreshRoleSession,
  logoutRole,
  logoutAllRoleSessions,
};
