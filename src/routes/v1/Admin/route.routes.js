const { Router } = require('express');
const routeController = require('../../../controllers/trip/route.controller');
const authenticate = require('../../../middlewares/auth/auth.middleware');
const requireRole = require('../../../middlewares/auth/role.middleware');
const validate = require('../../../middlewares/shared/validate.middleware');
const { createRoutesSchema } = require('../../../validators/trip/route.validator');

const router = Router();

router.post('/', authenticate, requireRole('admin'), validate(createRoutesSchema, 'body'), routeController.createRoutes);

module.exports = router;