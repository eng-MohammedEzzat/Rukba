'use strict';

const apiResponse = require('../utils/shared/apiResponse');

function healthHandler(_req, res) {
  return apiResponse(res, {
    message: 'OK',
    data: {
      service: 'rukba',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
  });
}

module.exports = { healthHandler };
