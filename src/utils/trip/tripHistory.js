'use strict';

function isValidUsageTime(value) {
  if (!value) return false;
  const time = new Date(value);
  return !Number.isNaN(time.getTime());
}

function pickRepresentativeUsedTicket(tickets) {
  return tickets.slice().sort((a, b) => {
    const aKnown = isValidUsageTime(a.validation?.scannedAt) ? 1 : 0;
    const bKnown = isValidUsageTime(b.validation?.scannedAt) ? 1 : 0;
    if (aKnown !== bKnown) return bKnown - aKnown;
    const aTime = isValidUsageTime(a.validation?.scannedAt)
      ? new Date(a.validation.scannedAt).getTime()
      : 0;
    const bTime = isValidUsageTime(b.validation?.scannedAt)
      ? new Date(b.validation.scannedAt).getTime()
      : 0;
    if (aTime !== bTime) return bTime - aTime;
    return String(b._id).localeCompare(String(a._id));
  })[0];
}

function latestKnownUsage(tickets) {
  let lastUsedAt = null;
  for (const ticket of tickets) {
    const scannedAt = ticket.validation?.scannedAt;
    if (!isValidUsageTime(scannedAt)) continue;
    const time = new Date(scannedAt);
    if (!lastUsedAt || time > lastUsedAt) {
      lastUsedAt = time;
    }
  }
  return lastUsedAt;
}

function buildHistoryGroups(usedTickets) {
  const byTrip = new Map();
  for (const ticket of usedTickets) {
    const key = String(ticket.trip);
    if (!byTrip.has(key)) {
      byTrip.set(key, []);
    }
    byTrip.get(key).push(ticket);
  }

  const groups = [];
  for (const [tripId, tickets] of byTrip.entries()) {
    groups.push({
      tripId,
      tickets,
      lastUsedAt: latestKnownUsage(tickets),
      representative: pickRepresentativeUsedTicket(tickets),
    });
  }

  groups.sort((a, b) => {
    const aKnown = a.lastUsedAt ? 1 : 0;
    const bKnown = b.lastUsedAt ? 1 : 0;
    if (aKnown !== bKnown) return bKnown - aKnown;
    if (a.lastUsedAt && b.lastUsedAt) {
      const delta = b.lastUsedAt.getTime() - a.lastUsedAt.getTime();
      if (delta !== 0) return delta;
    }
    return b.tripId.localeCompare(a.tripId);
  });

  return groups;
}

function bookedJourneyFromReceipt(receipt, ticket) {
  if (!receipt) {
    return {
      origin: null,
      destination: null,
      lineLabel: null,
      vehicleLabel: null,
      fareMinor: ticket?.fareMinor ?? null,
      currency: ticket?.currency ?? null,
    };
  }
  return {
    origin: receipt.origin ?? null,
    destination: receipt.destination ?? null,
    lineLabel: receipt.lineLabel ?? null,
    vehicleLabel: receipt.vehicleLabel ?? null,
    fareMinor: receipt.fareMinor ?? ticket?.fareMinor ?? null,
    currency: receipt.currency ?? ticket?.currency ?? null,
  };
}

module.exports = {
  buildHistoryGroups,
  bookedJourneyFromReceipt,
};
