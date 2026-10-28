'use strict';

const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomSegment(length) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

function generateTicketCode() {
  return `GZ-${randomSegment(4)}-${randomSegment(4)}`;
}

function generateReceiptCode() {
  return `RCP-${randomSegment(4)}-${randomSegment(4)}`;
}

module.exports = {
  generateTicketCode,
  generateReceiptCode,
};
