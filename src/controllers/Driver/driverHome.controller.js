'use strict';

const apiResponse = require('../../utils/shared/apiResponse');
const asyncHandler = require('../../utils/shared/asyncHandler');
const driverHomeService = require('../../services/Driver/driverHome.service');

const getHome = asyncHandler(async (req, res) =>
  apiResponse(res, {
    message: 'تم جلب بيانات الصفحة الرئيسية للسائق',
    data: await driverHomeService.getDriverHome(req.user._id),
  }));

module.exports = { getHome };
