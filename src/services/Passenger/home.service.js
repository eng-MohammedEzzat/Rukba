'use strict';

const { toPublicUser } = require('../shared/user.service');
const { listSavedRoutes } = require('./savedRoute.service');

async function getHomeData(user) {
  const { savedRoutes } = await listSavedRoutes(user.id);

  return {
    user: toPublicUser(user),
    savedRoutes,
  };
}

module.exports = { getHomeData };
