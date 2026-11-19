'use strict';

const apiResponse = require('../../utils/shared/apiResponse');
const asyncHandler = require('../../utils/shared/asyncHandler');
const clientMetadata = require('../../utils/auth/clientMetadata');
const phoneVerificationService = require('../../services/auth/phoneVerification.service');

function verifyPhone(role) {
  return asyncHandler(async (req, res) => {
    const verified = await phoneVerificationService.verifyPhone(
      role,
      req.body,
      clientMetadata(req)
    );
    return apiResponse(res, { message: 'تم تأكيد رقم الهاتف', data: verified });
  });
}

module.exports = { verifyPhone };
