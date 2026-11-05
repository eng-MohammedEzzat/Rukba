'use strict';

const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const REFERENCE_LENGTH = 10;

function generateProviderReference() {
  const bytes = crypto.randomBytes(REFERENCE_LENGTH);
  let out = '';
  for (let i = 0; i < REFERENCE_LENGTH; i += 1) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return `SIM-${out}`;
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
  generateProviderReference,
};
