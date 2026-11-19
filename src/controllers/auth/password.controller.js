'use strict';

const apiResponse = require('../../utils/shared/apiResponse');
const asyncHandler = require('../../utils/shared/asyncHandler');
const clientMetadata = require('../../utils/auth/clientMetadata');
const passwordService = require('../../services/auth/password.service');

function changePassword(role) {
  return asyncHandler(async (req, res) => {
    const tokens = await passwordService.changePassword(
      role,
      req.user._id,
      req.body,
      clientMetadata(req)
    );
    return apiResponse(res, { message: 'تم تغيير كلمة المرور', data: tokens });
  });
}

function resetPassword(role) {
  return asyncHandler(async (req, res) => {
    const reset = await passwordService.resetPassword(role, req.body, clientMetadata(req));
    return apiResponse(res, { message: 'تمت إعادة تعيين كلمة المرور', data: reset });
  });
}

function resetPasswordWithOtp(role) {
  return asyncHandler(async (req, res) => {
    const reset = await passwordService.resetPasswordWithOtp(role, req.body, clientMetadata(req));
    return apiResponse(res, { message: 'تمت إعادة تعيين كلمة المرور', data: reset });
  });
}

const issueDriverResetCode = asyncHandler(async (req, res) => {
  const issued = await passwordService.issueResetCode(req.user._id, req.params.driverId);
  return apiResponse(res, {
    statusCode: 201,
    message: 'تم إنشاء رمز إعادة تعيين كلمة المرور',
    data: issued,
  });
});

module.exports = {
  changePassword,
  resetPassword,
  resetPasswordWithOtp,
  issueDriverResetCode,
};
