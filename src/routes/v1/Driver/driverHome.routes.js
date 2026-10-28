'use strict';

const { Router } = require('express');
const driverHomeController = require('../../../controllers/Driver/driverHome.controller');
const authenticate = require('../../../middlewares/auth/auth.middleware');
const requireRole = require('../../../middlewares/auth/role.middleware');
const requireEligibleDriver = require('../../../middlewares/trip/driverEligibility.middleware');

const router = Router();
router.get(
  '/home',
  authenticate,
  requireRole('driver'),
  requireEligibleDriver,
  driverHomeController.getHome
);

module.exports = router;
