'use strict';

const { Router } = require('express');
const authController = require('../../../controllers/auth/auth.controller');
const validate = require('../../../middlewares/shared/validate.middleware');
const authenticate = require('../../../middlewares/auth/auth.middleware');
const requireRole = require('../../../middlewares/auth/role.middleware');
const {
  roleLoginSchema,
  roleRefreshSchema,
  roleLogoutSchema,
  roleLogoutAllSchema,
} = require('../../../validators/auth/roleAuth.validator');

const router = Router();
router.post('/login', validate(roleLoginSchema), authController.loginRole('admin'));
router.post('/refresh', validate(roleRefreshSchema), authController.refreshRoleSession('admin'));
router.post('/logout', validate(roleLogoutSchema), authController.logoutRole('admin'));
router.post(
  '/logout-all',
  authenticate,
  requireRole('admin'),
  validate(roleLogoutAllSchema),
  authController.logoutAllRoleSessions('admin')
);

module.exports = router;
