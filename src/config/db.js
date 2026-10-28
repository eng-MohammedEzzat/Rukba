'use strict';

const mongoose = require('mongoose');
const env = require('./env');

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 2000;

let isConnected = false;

async function connectDb(attempt = 1) {
  if (isConnected) {
    return mongoose.connection;
  }

  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(env.mongodbUri);
    isConnected = true;
    return mongoose.connection;
  } catch (err) {
    if (attempt >= MAX_RETRIES) {
      throw err;
    }
    await sleep(RETRY_DELAY_MS * attempt);
    return connectDb(attempt + 1);
  }
}

async function closeDb() {
  if (!isConnected) {
    return;
  }
  await mongoose.connection.close();
  isConnected = false;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { connectDb, closeDb };
