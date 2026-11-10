'use strict';

const crypto = require('crypto');

function createOperationId() {
  return crypto.randomUUID();
}

module.exports = { createOperationId };
