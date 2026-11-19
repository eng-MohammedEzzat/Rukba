const { Router } = require('express');
const routeController = require('../../../controllers/trip/route.controller');
const authenticate = require('../../../middlewares/auth/auth.middleware');
const requireRole = require('../../../middlewares/auth/role.middleware');
const validate = require('../../../middlewares/shared/validate.middleware');
const {
  adminListRoutesSchema,
  routeParamsSchema,
  createRoutesSchema,
  updateRouteSchema,
} = require('../../../validators/trip/route.validator');

const router = Router();

router.use(authenticate, requireRole('admin'));
router.get('/', validate(adminListRoutesSchema, 'query'), routeController.listAdminRoutes);
router.get('/:routeId', validate(routeParamsSchema, 'params'), routeController.getAdminRoute);
router.post('/', validate(createRoutesSchema, 'body'), routeController.createRoute);
router.patch(
  '/:routeId',
  validate(routeParamsSchema, 'params'),
  validate(updateRouteSchema, 'body'),
  routeController.updateRoute
);

module.exports = router;
