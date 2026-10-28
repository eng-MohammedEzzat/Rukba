'use strict';

const ApiError = require('../../utils/shared/ApiError');

function rejectNonemptyBody(req, _res, next) {
  const body = req.body;
  if (body == null) return next();
  if (typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length === 0) {
    return next();
  }
  return next(new ApiError(400, 'Validation failed', [
    { path: 'body', message: 'Request body must be empty' },
  ]));
}

module.exports = rejectNonemptyBody;
