'use strict';

const apiResponse = require('../../utils/shared/apiResponse');
const asyncHandler = require('../../utils/shared/asyncHandler');
const walletService = require('../../services/wallet/wallet.service');

const getWallet = asyncHandler(async (req, res) => {
  const data = await walletService.getWallet(req.user._id, req.user.role);
  return apiResponse(res, {
    message: 'OK',
    data,
  });
});

const listTransactions = asyncHandler(async (req, res) => {
  const data = await walletService.listTransactions(
    req.user._id,
    req.validatedQuery || {}
  );
  return apiResponse(res, {
    message: 'OK',
    data,
  });
});

const topUp = asyncHandler(async (req, res) => {
  const data = await walletService.topUp(req.user, req.body);
  return apiResponse(res, {
    statusCode: 201,
    message: 'Wallet topped up',
    data,
  });
});

const requestPayout = asyncHandler(async (req, res) => {
  const data = await walletService.requestPayout(req.user, req.body);
  return apiResponse(res, {
    statusCode: 201,
    message: 'Payout completed',
    data,
  });
});

module.exports = {
  getWallet,
  listTransactions,
  topUp,
  requestPayout,
};
