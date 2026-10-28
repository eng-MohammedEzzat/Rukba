'use strict';

const ApiError = require('../shared/ApiError');

function roleApiError(statusCode, message, code, details = {}) {
  return new ApiError(statusCode, message, { ...details, code });
}

module.exports = roleApiError;
