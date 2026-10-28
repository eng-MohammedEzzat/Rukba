'use strict';

const { Router } = require('express');
const homeController = require('../../../controllers/Passenger/home.controller');
const authenticate = require('../../../middlewares/auth/auth.middleware');
const requireRole = require('../../../middlewares/auth/role.middleware');

const router = Router();

router.use(authenticate, requireRole('passenger'));
router.get('/', homeController.getHome);

module.exports = router;
