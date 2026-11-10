'use strict';

function apiResponse(res, { statusCode = 200, message = 'تمت العملية بنجاح', data = null } = {}) {
  return res.status(statusCode).json({
    status: statusCode >= 400 ? 'error' : 'success',
    message,
    data,
  });
}

module.exports = apiResponse;
