'use strict';

const { parsePhoneNumberFromString } = require('libphonenumber-js');
const env = require('../../config/env');
const ApiError = require('../shared/ApiError');

function normalizePhone(rawPhone) {
  const trimmed = String(rawPhone ?? '').trim();
  let candidate = trimmed.replace(/[\s-]/g, '');
  if (candidate.startsWith('00')) {
    candidate = `+${candidate.slice(2)}`;
  }

  const parsed = parsePhoneNumberFromString(candidate, env.defaultPhoneRegion);
  if (!parsed || !parsed.isValid()) {
    throw new ApiError(400, 'Invalid phone number', { field: 'phone' });
  }

  return parsed.format('E.164');
}

module.exports = { normalizePhone };
