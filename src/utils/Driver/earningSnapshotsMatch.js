'use strict';

function sameId(left, right) {
  return String(left) === String(right);
}

function earningSnapshotsMatch(stored, expected) {
  if (!stored || !expected) return false;
  return sameId(stored.driver, expected.driver)
    && sameId(stored.trip, expected.trip)
    && stored.ticketCount === expected.ticketCount
    && stored.grossMinor === expected.grossMinor
    && stored.platformFeeMinor === expected.platformFeeMinor
    && stored.netMinor === expected.netMinor
    && stored.currency === expected.currency
    && stored.status === expected.status
    && stored.periodKey === expected.periodKey
    && stored.routeOrigin === expected.routeOrigin
    && stored.routeDestination === expected.routeDestination
    && stored.policyVersion === expected.policyVersion
    && stored.feeBasisPoints === expected.feeBasisPoints
    && stored.trigger === expected.trigger
    && stored.paymentTreatment === expected.paymentTreatment;
}

module.exports = { earningSnapshotsMatch };
