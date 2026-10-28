'use strict';

const crypto = require('crypto');

function lifecycleFingerprint(action, target) {
  return crypto.createHash('sha256').update(JSON.stringify([action, String(target)])).digest('hex');
}

function createRunFingerprint(routeId, vehicleLabel) {
  if (vehicleLabel == null) {
    return lifecycleFingerprint('trip_created', routeId);
  }
  return crypto.createHash('sha256')
    .update(JSON.stringify(['trip_created', String(routeId), 'v1:vehicleLabel', vehicleLabel]))
    .digest('hex');
}

module.exports = { lifecycleFingerprint, createRunFingerprint };
