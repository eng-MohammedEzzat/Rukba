'use strict';

const randomCode = require('../shared/randomCode');

function generateTicketCode() {
  return `GZ-${randomCode(4)}-${randomCode(4)}`;
}

function generateReceiptCode() {
  return `RCP-${randomCode(4)}-${randomCode(4)}`;
}

module.exports = {
  generateTicketCode,
  generateReceiptCode,
};
