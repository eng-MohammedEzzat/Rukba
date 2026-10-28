'use strict';

const { Router } = require('express');
const ticketController = require('../../../controllers/ticket/ticket.controller');
const authenticate = require('../../../middlewares/auth/auth.middleware');
const requireRole = require('../../../middlewares/auth/role.middleware');
const validate = require('../../../middlewares/shared/validate.middleware');
const {
  bookTicketSchema,
  listTicketsSchema,
  ticketIdParamsSchema,
} = require('../../../validators/ticket/ticket.validator');

const router = Router();

router.use(authenticate, requireRole('passenger'));

router.get('/', validate(listTicketsSchema, 'query'), ticketController.listTickets);
router.post('/', validate(bookTicketSchema), ticketController.bookTicket);
router.get(
  '/:ticketId',
  validate(ticketIdParamsSchema, 'params'),
  ticketController.getTicket
);
router.get(
  '/:ticketId/qr',
  validate(ticketIdParamsSchema, 'params'),
  ticketController.getTicketQr
);
router.post(
  '/:ticketId/cancel',
  validate(ticketIdParamsSchema, 'params'),
  ticketController.cancelTicket
);
router.get(
  '/:ticketId/receipt',
  validate(ticketIdParamsSchema, 'params'),
  ticketController.getTicketReceipt
);

module.exports = router;
