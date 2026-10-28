'use strict';

const { Router } = require('express');
const driverProfileController = require('../../../controllers/Driver/driverProfile.controller');
const validate = require('../../../middlewares/shared/validate.middleware');
const { driverProfileUpdateSchema } = require('../../../validators/Driver/driverProfile.validator');
const authenticate = require('../../../middlewares/auth/auth.middleware');
const requireRole = require('../../../middlewares/auth/role.middleware');

const router = Router();
router.use(authenticate, requireRole('driver'));
router.get('/', driverProfileController.getProfile);
router.patch('/', validate(driverProfileUpdateSchema), driverProfileController.updateProfile);

module.exports = router;
