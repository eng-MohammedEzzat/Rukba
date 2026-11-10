'use strict';

const apiResponse = require('../../utils/shared/apiResponse');
const asyncHandler = require('../../utils/shared/asyncHandler');
const userService = require('../../services/shared/user.service');

const getProfile = asyncHandler(async (req, res) => {
  return apiResponse(res, {
    message: 'تمت العملية بنجاح',
    data: { user: userService.toPublicUser(req.user) },
  });
});

const updateProfile = asyncHandler(async (req, res) => {
  const user = await userService.updateProfile(req.user, req.body, req.file);
  return apiResponse(res, {
    message: 'تم تحديث الملف الشخصي',
    data: { user },
  });
});

module.exports = {
  getProfile,
  updateProfile,
};
