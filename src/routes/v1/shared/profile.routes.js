'use strict';

const { Router } = require('express');
const profileController = require('../../../controllers/shared/profile.controller');
const authenticate = require('../../../middlewares/auth/auth.middleware');
const requireRole = require('../../../middlewares/auth/role.middleware');
const validate = require('../../../middlewares/shared/validate.middleware');
const uploadUserImageMiddleware = require('../../../middlewares/shared/upload.middleware');
const { updateProfileSchema } = require('../../../validators/shared/profile.validator');

const router = Router();

router.use(authenticate, requireRole('passenger'));

router.get('/', profileController.getProfile);
router.patch(
  '/',
  uploadUserImageMiddleware,
  validate(updateProfileSchema),
  profileController.updateProfile
);

module.exports = router;
