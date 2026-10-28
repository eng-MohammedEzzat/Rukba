'use strict';

const apiResponse = require('../../utils/shared/apiResponse');
const asyncHandler = require('../../utils/shared/asyncHandler');
const notificationService = require('../../services/shared/notification.service');

const listNotifications = asyncHandler(async (req, res) =>
  apiResponse(res, {
    data: await notificationService.listNotifications(req.user._id, req.validatedQuery || {}),
  }));

const markRead = asyncHandler(async (req, res) =>
  apiResponse(res, {
    message: 'Notification marked read',
    data: {
      notification: await notificationService.markNotificationRead(
        req.user._id,
        req.params.notificationId
      ),
    },
  }));

module.exports = { listNotifications, markRead };
