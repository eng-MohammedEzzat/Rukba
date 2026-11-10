'use strict';

const randomCode = require('../shared/randomCode');

function generateProviderReference() {
  return `SIM-${randomCode(10)}`;
}

/**
 * Stand-in for Jawwal Pay / Bank of Palestine. Every request succeeds instantly;
 * a real adapter must keep the same return shape.
 */
function collect({ provider, amountMinor }) {
  return { status: 'succeeded', provider, amountMinor, providerReference: generateProviderReference() };
}

function disburse({ provider, amountMinor }) {
  return { status: 'succeeded', provider, amountMinor, providerReference: generateProviderReference() };
}

module.exports = {
  collect,
  disburse,
};
