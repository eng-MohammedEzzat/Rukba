'use strict';

const { toPublicUser } = require('../shared/user.service');
const { listActiveRoutes } = require('../trip/route.service');

async function getHomeData(user) {
  const routes = await listActiveRoutes();

  return {
    user: toPublicUser(user),
    routes,
  };
}

module.exports = { getHomeData };
