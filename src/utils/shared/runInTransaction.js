'use strict';

const mongoose = require('mongoose');

let cachedSupport = null;
let cachedConnectionId = null;

async function deploymentSupportsTransactions() {
  const connectionId = mongoose.connection.id;
  if (cachedConnectionId === connectionId && cachedSupport !== null) {
    return cachedSupport;
  }

  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  cachedSupport = Boolean(hello.setName) || hello.msg === 'isdbgrid';
  cachedConnectionId = connectionId;
  return cachedSupport;
}

/**
 * Runs `work` in a multi-document transaction on a replica set or mongos.
 * A standalone server rejects transaction numbers, so the same work runs on a
 * client session without starting a transaction.
 */
async function runInTransaction(work, options) {
  const session = await mongoose.startSession();
  try {
    if (!(await deploymentSupportsTransactions())) {
      return await work(session);
    }

    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    }, options);
    return result;
  } finally {
    await session.endSession();
  }
}

module.exports = {
  deploymentSupportsTransactions,
  runInTransaction,
};
