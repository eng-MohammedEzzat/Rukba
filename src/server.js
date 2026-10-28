'use strict';

const env = require('./config/env');
const { connectDb, closeDb } = require('./config/db');
const app = require('./app');

async function start() {
  await connectDb();

  const server = app.listen(env.port);

  const shutdown = async () => {
    server.close(async () => {
      try {
        await closeDb();
        process.exit(0);
      } catch {
        process.exit(1);
      }
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch(() => {
  process.exit(1);
});
