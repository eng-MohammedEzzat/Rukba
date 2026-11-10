'use strict';

const { User } = require('../../models');
const ApiError = require('../../utils/shared/ApiError');
const asyncHandler = require('../../utils/shared/asyncHandler');
const { verifyAccessToken } = require('../../utils/auth/tokens');

const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new ApiError(401, 'رمز الدخول غير صالح أو منتهي الصلاحية');
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      throw new ApiError(401, 'رمز الدخول غير صالح أو منتهي الصلاحية');
    }
    throw err;
  }

  const user = await User.findById(payload.sub);
  if (!user || user.isDeleted || user.status !== 'active') {
    throw new ApiError(401, 'المستخدم غير موجود أو غير مفعّل');
  }

  if (payload.role && payload.role !== user.role) {
    throw new ApiError(401, 'رمز الدخول غير صالح أو منتهي الصلاحية');
  }

  req.user = user;
  next();
});

module.exports = authenticate;
