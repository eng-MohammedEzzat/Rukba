'use strict';

const apiResponse = require('../../utils/shared/apiResponse');
const asyncHandler = require('../../utils/shared/asyncHandler');
const ticketValidationService = require('../../services/ticket/ticketValidation.service');

const previewTicket = asyncHandler(async (req, res) => {
  const preview = await ticketValidationService.previewTicket(req.user._id, req.body);
  return apiResponse(res, { message: 'OK', data: preview });
});

const validateTicket = asyncHandler(async (req, res) => {
  const validation = await ticketValidationService.validateTicket(req.user._id, req.body);
  return apiResponse(res, { message: 'Ticket validated', data: validation });
});

module.exports = { previewTicket, validateTicket };
