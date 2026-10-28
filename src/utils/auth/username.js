'use strict';

const ApiError = require('../shared/ApiError');

function normalizeUsername(rawUsername) {
  const normalized = String(rawUsername ?? '').trim().toLowerCase();
  if (!normalized) {
    throw new ApiError(400, 'Invalid username', { field: 'username' });
  }
  return normalized;
}

module.exports = { normalizeUsername };
