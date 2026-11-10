'use strict';

const ApiError = require('../../utils/shared/ApiError');

function rejectNonemptyBody(req, _res, next) {
  const body = req.body;
  if (body == null) return next();
  if (typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length === 0) {
    return next();
  }
  return next(new ApiError(400, 'البيانات المدخلة غير صالحة', [
    { path: 'body', message: 'يجب أن يكون جسم الطلب فارغًا' },
  ]));
}

module.exports = rejectNonemptyBody;
