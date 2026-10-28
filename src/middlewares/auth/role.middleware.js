'use strict';

const ApiError = require('../../utils/shared/ApiError');

function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(new ApiError(401, 'Authentication required'));
    }
    if (!roles.includes(req.user.role)) {
      return next(new ApiError(403, 'Forbidden for this role'));
    }
    return next();
  };
}

module.exports = requireRole;
