'use strict';

const { Router } = require('express');
const ticketValidationController = require('../../../controllers/ticket/ticketValidation.controller');
const authenticate = require('../../../middlewares/auth/auth.middleware');
const requireRole = require('../../../middlewares/auth/role.middleware');
const requireEligibleDriver = require('../../../middlewares/trip/driverEligibility.middleware');
const validate = require('../../../middlewares/shared/validate.middleware');
const {
  previewTicketSchema,
  validateTicketSchema,
} = require('../../../validators/ticket/ticketValidation.validator');

const router = Router();

router.use(authenticate, requireRole('driver'), requireEligibleDriver);
router.post(
  '/tickets/preview',
  validate(previewTicketSchema),
  ticketValidationController.previewTicket
);
router.post(
  '/tickets/scan',
  validate(validateTicketSchema),
  ticketValidationController.validateTicket
);

module.exports = router;
