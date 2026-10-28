'use strict';

function clientMetadata(req) {
  return {
    userAgent: req.get('user-agent') || null,
    ip: req.ip || req.socket?.remoteAddress || null,
  };
}

module.exports = clientMetadata;
