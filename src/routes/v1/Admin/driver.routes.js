'use strict';

const { Router } = require('express');
const passwordController = require('../../../controllers/auth/password.controller');
const authenticate = require('../../../middlewares/auth/auth.middleware');
const requireRole = require('../../../middlewares/auth/role.middleware');
const validate = require('../../../middlewares/shared/validate.middleware');
const { driverParamsSchema } = require('../../../validators/auth/password.validator');

const router = Router();
router.use(authenticate, requireRole('admin'));
router.post(
  '/:driverId/password-reset',
  validate(driverParamsSchema, 'params'),
  passwordController.issueDriverResetCode
);

module.exports = router;
