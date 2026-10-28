'use strict';

const { Router } = require('express');
const driverApplicationController = require('../../../controllers/Driver/driverApplication.controller');
const authenticate = require('../../../middlewares/auth/auth.middleware');
const requireRole = require('../../../middlewares/auth/role.middleware');
const validate = require('../../../middlewares/shared/validate.middleware');
const {
  applicationQuerySchema,
  applicationParamsSchema,
  applicationDecisionSchema,
} = require('../../../validators/Driver/driverApplication.validator');

const router = Router();
router.use(authenticate, requireRole('admin'));
router.get('/', validate(applicationQuerySchema, 'query'), driverApplicationController.listApplications);
router.get(
  '/:applicationId',
  validate(applicationParamsSchema, 'params'),
  driverApplicationController.getApplication
);
router.post(
  '/:applicationId/decision',
  validate(applicationParamsSchema, 'params'),
  validate(applicationDecisionSchema),
  driverApplicationController.decideApplication
);

module.exports = router;
