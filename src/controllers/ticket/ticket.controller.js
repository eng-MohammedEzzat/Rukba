'use strict';

const apiResponse = require('../../utils/shared/apiResponse');
const asyncHandler = require('../../utils/shared/asyncHandler');
const ticketService = require('../../services/ticket/ticket.service');

const bookTicket = asyncHandler(async (req, res) => {
  const booking = await ticketService.bookTicket(req.user, req.body);
  return apiResponse(res, {
    statusCode: 201,
    message: 'تم حجز التذكرة بنجاح',
    data: booking,
  });
});

const listTickets = asyncHandler(async (req, res) => {
  const ticketList = await ticketService.listTickets(
    req.user._id,
    req.validatedQuery || {}
  );
  return apiResponse(res, {
    message: 'تمت العملية بنجاح',
    data: ticketList,
  });
});

const getTicket = asyncHandler(async (req, res) => {
  const ticket = await ticketService.getTicket(
    req.user._id,
    req.params.ticketId
  );
  return apiResponse(res, {
    message: 'تمت العملية بنجاح',
    data: { ticket },
  });
});

const getTicketQr = asyncHandler(async (req, res) => {
  const qrLink = await ticketService.getTicketQrLink(
    req.user._id,
    req.params.ticketId
  );
  return apiResponse(res, {
    message: 'تمت العملية بنجاح',
    data: qrLink,
  });
});

const cancelTicket = asyncHandler(async (req, res) => {
  const ticket = await ticketService.cancelTicket(
    req.user._id,
    req.params.ticketId
  );
  return apiResponse(res, {
    message: 'تم إلغاء التذكرة',
    data: { ticket },
  });
});

const getTicketReceipt = asyncHandler(async (req, res) => {
  const receipt = await ticketService.viewTicketReceipt(
    req.user._id,
    req.params.ticketId
  );
  return apiResponse(res, {
    message: 'تمت العملية بنجاح',
    data: receipt,
  });
});

module.exports = {
  bookTicket,
  listTickets,
  getTicket,
  getTicketQr,
  cancelTicket,
  getTicketReceipt,
};
