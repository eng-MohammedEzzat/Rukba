'use strict';

const { Router } = require('express');
const authController = require('../../../controllers/auth/auth.controller');
const validate = require('../../../middlewares/shared/validate.middleware');
const authenticate = require('../../../middlewares/auth/auth.middleware');
const requireRole = require('../../../middlewares/auth/role.middleware');
const uploadUserImageMiddleware = require('../../../middlewares/shared/upload.middleware');
const {
  roleLoginSchema,
  roleRefreshSchema,
  roleLogoutSchema,
  roleLogoutAllSchema,
} = require('../../../validators/auth/roleAuth.validator');
const {
  driverRegistrationSchema,
} = require('../../../validators/auth/driverRegistration.validator');

const router = Router();
router.post('/login', validate(roleLoginSchema), authController.loginRole('driver'));
router.post(
  '/register',
  uploadUserImageMiddleware,
  validate(driverRegistrationSchema),
  authController.registerDriver
);
router.post('/refresh', validate(roleRefreshSchema), authController.refreshRoleSession('driver'));
router.post('/logout', validate(roleLogoutSchema), authController.logoutRole('driver'));
router.post(
  '/logout-all',
  authenticate,
  requireRole('driver'),
  validate(roleLogoutAllSchema),
  authController.logoutAllRoleSessions('driver')
);

module.exports = router;
