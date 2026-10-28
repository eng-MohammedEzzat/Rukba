'use strict';

const { Router } = require('express');
const notificationController = require('../../../controllers/shared/notification.controller');
const authenticate = require('../../../middlewares/auth/auth.middleware');
const requireRole = require('../../../middlewares/auth/role.middleware');
const validate = require('../../../middlewares/shared/validate.middleware');
const {
  notificationListQuerySchema,
  notificationParamsSchema,
} = require('../../../validators/shared/notification.validator');

const router = Router();
router.use(authenticate, requireRole('passenger', 'driver'));
router.get('/', validate(notificationListQuerySchema, 'query'), notificationController.listNotifications);
router.patch(
  '/:notificationId/read',
  validate(notificationParamsSchema, 'params'),
  notificationController.markRead
);

module.exports = router;
