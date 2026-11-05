'use strict';

const { toPublicUser } = require('../shared/user.service');
const { listSavedRoutes } = require('./savedRoute.service');

async function getHomeData(user) {
  const routes = await listSavedRoutes(user.id);

  return {
    user: toPublicUser(user),
    routes,
  };
}

module.exports = { getHomeData };
