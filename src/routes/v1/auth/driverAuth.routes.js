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
const passwordController = require('../../../controllers/auth/password.controller');
const {
  changePasswordSchema,
  resetPasswordSchema,
  otpResetPasswordSchema,
} = require('../../../validators/auth/password.validator');
const phoneVerificationController = require('../../../controllers/auth/phoneVerification.controller');
const { verifyPhoneCodeSchema } = require('../../../validators/auth/phoneVerification.validator');

const router = Router();
router.post('/login', validate(roleLoginSchema), authController.loginRole('driver'));
router.post(
  '/register/verify-phone',
  validate(verifyPhoneCodeSchema),
  phoneVerificationController.verifyPhone('driver')
);
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
router.patch(
  '/password',
  authenticate,
  requireRole('driver'),
  validate(changePasswordSchema),
  passwordController.changePassword('driver')
);
router.post(
  '/password/reset',
  validate(resetPasswordSchema),
  passwordController.resetPassword('driver')
);
router.post(
  '/password/forgot/reset',
  validate(otpResetPasswordSchema),
  passwordController.resetPasswordWithOtp('driver')
);

module.exports = router;
