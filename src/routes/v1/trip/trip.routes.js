'use strict';

const { Router } = require('express');
const tripController = require('../../../controllers/trip/trip.controller');
const authenticate = require('../../../middlewares/auth/auth.middleware');
const requireRole = require('../../../middlewares/auth/role.middleware');
const validate = require('../../../middlewares/shared/validate.middleware');
const { historyTripsSchema } = require('../../../validators/trip/trip.validator');

const router = Router();

router.use(authenticate, requireRole('passenger'));

router.get(
  '/history',
  validate(historyTripsSchema, 'query'),
  tripController.listHistory
);

module.exports = router;
