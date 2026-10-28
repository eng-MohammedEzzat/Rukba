'use strict';

const { Router } = require('express');
const routeController = require('../../../controllers/trip/route.controller');
const authenticate = require('../../../middlewares/auth/auth.middleware');
const requireRole = require('../../../middlewares/auth/role.middleware');
const validate = require('../../../middlewares/shared/validate.middleware');
const {
  listRoutesSchema,
  routeParamsSchema,
} = require('../../../validators/trip/route.validator');

const router = Router();

router.use(authenticate, requireRole('passenger'));
router.get('/', validate(listRoutesSchema, 'query'), routeController.listRoutes);
router.get(
  '/:routeId',
  validate(routeParamsSchema, 'params'),
  routeController.getRoute
);

module.exports = router;
