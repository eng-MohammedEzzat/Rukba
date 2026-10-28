'use strict';

const { Router } = require('express');
const savedRouteController = require('../../../controllers/Passenger/savedRoute.controller');
const authenticate = require('../../../middlewares/auth/auth.middleware');
const requireRole = require('../../../middlewares/auth/role.middleware');
const validate = require('../../../middlewares/shared/validate.middleware');
const {
  saveRouteSchema,
  listSavedRoutesSchema,
  savedRouteParamsSchema,
} = require('../../../validators/Passenger/savedRoute.validator');

const router = Router();

router.use(authenticate, requireRole('passenger'));

router.get(
  '/',
  validate(listSavedRoutesSchema, 'query'),
  savedRouteController.listSavedRoutes
);
router.post('/', validate(saveRouteSchema), savedRouteController.saveRoute);
router.delete(
  '/:routeId',
  validate(savedRouteParamsSchema, 'params'),
  savedRouteController.removeSavedRoute
);

module.exports = router;
