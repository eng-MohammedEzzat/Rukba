'use strict';

const { Router } = require('express');
const authController = require('../../../controllers/auth/auth.controller');
const validate = require('../../../middlewares/shared/validate.middleware');
const authenticate = require('../../../middlewares/auth/auth.middleware');
const requireRole = require('../../../middlewares/auth/role.middleware');
const {
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
} = require('../../../validators/auth/auth.validator');

const router = Router();

router.post('/register', validate(registerSchema), authController.registerPassenger);
router.post('/login', validate(loginSchema), authController.loginPassenger);
router.post('/refresh', validate(refreshSchema), authController.refreshPassengerSession);
router.post('/logout', validate(logoutSchema), authController.logoutPassenger);
router.post(
  '/logout-all',
  authenticate,
  requireRole('passenger'),
  authController.logoutAllPassengerSessions
);

module.exports = router;
