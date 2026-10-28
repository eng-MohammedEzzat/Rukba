'use strict';

const { Router } = require('express');
const driverTripController = require('../../../controllers/trip/driverTrip.controller');
const activityController = require('../../../controllers/Driver/driverActivity.controller');
const earningController = require('../../../controllers/Driver/driverEarning.controller');
const authenticate = require('../../../middlewares/auth/auth.middleware');
const requireRole = require('../../../middlewares/auth/role.middleware');
const requireEligibleDriver = require('../../../middlewares/trip/driverEligibility.middleware');
const validate = require('../../../middlewares/shared/validate.middleware');
const rejectNonemptyBody = require('../../../middlewares/shared/emptyBody.middleware');
const {
  routeQuerySchema,
  createTripSchema,
  operationSchema,
  tripParamsSchema,
} = require('../../../validators/trip/driverTrip.validator');
const { activityQuerySchema } = require('../../../validators/Driver/driverActivity.validator');
const { earningsQuerySchema } = require('../../../validators/Driver/driverEarning.validator');

const router = Router();

router.use(
  ['/routes', '/trips', '/activity', '/earnings'],
  authenticate,
  requireRole('driver'),
  requireEligibleDriver
);

router.get('/routes', validate(routeQuerySchema, 'query'), driverTripController.listRoutes);

router.post('/trips', validate(createTripSchema), driverTripController.createRun);
router.get('/trips/current', driverTripController.currentRun);
router.get('/trips/:tripId', validate(tripParamsSchema, 'params'), driverTripController.ownedRun);
router.post(
  '/trips/:tripId/complete',
  validate(tripParamsSchema, 'params'),
  validate(operationSchema),
  driverTripController.complete
);

router.get(
  '/activity',
  rejectNonemptyBody,
  validate(activityQuerySchema, 'query'),
  activityController.getActivity
);
router.get(
  '/earnings',
  rejectNonemptyBody,
  validate(earningsQuerySchema, 'query'),
  earningController.getEarnings
);

module.exports = router;
