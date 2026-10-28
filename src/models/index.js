'use strict';

const User = require('./auth/user.model');
const DriverProfile = require('./Driver/driverProfile.model');
const Route = require('./trip/route.model');
const Trip = require('./trip/trip.model');
const Ticket = require('./ticket/ticket.model');
const ActionHistory = require('./ticket/actionHistory.model');
const Earning = require('./Driver/earning.model');
const Review = require('./Driver/review.model');
const Notification = require('./shared/notification.model');
const SavedRoute = require('./Passenger/savedRoute.model');
const RefreshToken = require('./auth/refreshToken.model');
const AuthFailureCounter = require('./auth/authFailureCounter.model');

module.exports = {
  User,
  DriverProfile,
  Route,
  Trip,
  Ticket,
  ActionHistory,
  Earning,
  Review,
  Notification,
  SavedRoute,
  RefreshToken,
  AuthFailureCounter,
};
