'use strict';

const ApiError = require('../../utils/shared/ApiError');

function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(new ApiError(401, 'يجب تسجيل الدخول أولًا'));
    }
    if (!roles.includes(req.user.role)) {
      return next(new ApiError(403, 'غير مصرّح لهذا الدور بالوصول'));
    }
    return next();
  };
}

module.exports = requireRole;
