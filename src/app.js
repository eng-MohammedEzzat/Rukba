'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const env = require('./config/env');
const routes = require('./routes');
const { healthHandler } = require('./controllers/health.controller');
const { notFoundHandler, errorHandler } = require('./middlewares/shared/error.middleware');

const app = express();
if (env.trustProxy) {
  app.set('trust proxy', 1);
}

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', healthHandler);
app.use('/api/v1', routes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
