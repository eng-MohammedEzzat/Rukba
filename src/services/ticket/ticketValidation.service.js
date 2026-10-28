'use strict';

const crypto = require('crypto');
const mongoose = require('mongoose');
const { User, DriverProfile, Ticket, Trip, ActionHistory } = require('../../models');
const ApiError = require('../../utils/shared/ApiError');
const { verifyPresentedQrToken } = require('../../utils/ticket/qrToken');
const { isEligibleDriver } = require('../../utils/trip/driverTripEligibility');
const { runJourneyDisplay, storedJourneyDisplay } = require('../../utils/trip/journeyDisplay');
const { recordTicketUsedNotification } = require('../shared/notification.service');
const {
  deploymentSupportsTransactions,
  runInTransaction,
} = require('../../utils/shared/runInTransaction');

const MAX_SAFE = Number.MAX_SAFE_INTEGER;
const MAX_RETRIES = 5;
const ALLOWED_TRIP_STATUSES = ['boarding', 'in_progress'];

const writeBarriers = {
  beforeTripWrite: async () => {},
  beforeTicketWrite: async () => {},
  beforeEventWrite: async () => {},
  beforeCommit: async () => {},
};

function setWriteBarriers(next = {}) {
  writeBarriers.beforeTripWrite = next.beforeTripWrite || (async () => {});
  writeBarriers.beforeTicketWrite = next.beforeTicketWrite || (async () => {});
  writeBarriers.beforeEventWrite = next.beforeEventWrite || (async () => {});
  writeBarriers.beforeCommit = next.beforeCommit || (async () => {});
}

function conflict(code, message, statusCode = 409) {
  return new ApiError(statusCode, message, { code });
}

function fingerprint(tokenHash) {
  return crypto.createHash('sha256').update(JSON.stringify(['ticket_used', tokenHash])).digest('hex');
}

function createOperationId() {
  return crypto.randomUUID();
}

function isTransientTransactionError(error) {
  return Boolean(
    error?.errorLabels?.includes('TransientTransactionError') ||
    error?.errorLabels?.includes('UnknownTransactionCommitResult') ||
    error?.hasErrorLabel?.('TransientTransactionError') ||
    error?.hasErrorLabel?.('UnknownTransactionCommitResult')
  );
}

async function eligibleInSession(driverId, session) {
  const user = await User.findById(driverId).select('+authRevision').session(session);
  const profile = await DriverProfile.findOne({ user: driverId }).session(session);
  if (!isEligibleDriver(user, profile)) {
    throw new ApiError(403, 'Driver is not eligible to operate', { code: 'DRIVER_INELIGIBLE' });
  }
  return { user, profile };
}

async function findReplay(driverId, operationId, inputFingerprint, session) {
  const query = ActionHistory.findOne({ actor: driverId, operationId });
  const event = await (session ? query.session(session) : query);
  if (!event) return null;
  if (event.actionType !== 'ticket_used' || event.inputFingerprint !== inputFingerprint) {
    throw conflict('OPERATION_KEY_REUSED', 'Operation identifier was used for another action');
  }
  return toDriverValidationResult(event.validationResult, true);
}

function sameId(left, right) {
  if (left == null || right == null) return false;
  return String(left) === String(right);
}

function claimsMatchTicket(claims, ticket) {
  const payload = ticket.qr?.payload || {};
  if (
    !sameId(claims.routeId, ticket.route)
    || !sameId(claims.routeId, payload.routeId)
  ) {
    return false;
  }

  // Legacy Trip-bound QRs carry tripId; route-scoped QRs omit it. Attribution
  // written onto ticket.trip at validation must not break claim matching.
  if (claims.tripId != null) {
    if (!sameId(claims.tripId, payload.tripId)) return false;
    if (
      ticket.trip
      && ticket.status === 'active'
      && !sameId(claims.tripId, ticket.trip)
    ) {
      return false;
    }
  }

  return (
    claims.tokenHash === ticket.qr.tokenHash &&
    claims.jti === ticket.qr.jti &&
    sameId(claims.ticketId, ticket._id) &&
    sameId(claims.ticketId, payload.ticketId) &&
    sameId(claims.passengerId, ticket.passenger) &&
    sameId(claims.passengerId, payload.passengerId) &&
    claims.ticketCode === String(ticket.ticketCode).toUpperCase() &&
    claims.fareMinor === ticket.fareMinor &&
    claims.currency === ticket.currency
  );
}

function isAlreadyUsed(ticket) {
  return ticket.status === 'used'
    || Boolean(ticket.validation?.scannedAt)
    || Boolean(ticket.validation?.actionHistory);
}

function alreadyUsedError(display) {
  return new ApiError(409, 'Ticket has already been used', {
    code: 'TICKET_ALREADY_USED',
    display,
  });
}

function ticketJourneySnapshot(ticket, trip) {
  const journey = runJourneyDisplay(trip);
  return {
    ticketCode: ticket.ticketCode ? String(ticket.ticketCode).toUpperCase() : null,
    origin: trip.routeOrigin ?? null,
    destination: trip.routeDestination ?? null,
    lineLabel: journey.lineLabel,
    vehicleLabel: journey.vehicleLabel,
    fareMinor: ticket.fareMinor,
    currency: ticket.currency,
    status: ticket.status,
  };
}

function captureValidationSnapshot({ ticket, trip, passengerDisplayName, usedAt }) {
  return {
    passengerDisplayName,
    ticketId: String(ticket._id),
    tripId: String(trip._id),
    usedAt,
    ...ticketJourneySnapshot(ticket, trip),
  };
}

function capturePreviewSnapshot({ ticket, trip, passengerDisplayName }) {
  return {
    passengerDisplayName,
    ticketId: String(ticket._id),
    tripId: String(trip._id),
    ...ticketJourneySnapshot(ticket, trip),
  };
}

async function alreadyUsedDisplay(ticketId, session) {
  const query = ActionHistory.findOne({ ticket: ticketId, actionType: 'ticket_used' });
  const event = await (session ? query.session(session) : query);
  return storedJourneyDisplay(event?.validationResult);
}

function classifyTicketState(ticket, now) {
  if (ticket.status === 'cancelled' || ticket.cancelledAt) {
    throw conflict('TICKET_CANCELLED', 'Ticket has been cancelled');
  }
  if (!ticket.qr?.expiresAt || now >= new Date(ticket.qr.expiresAt)) {
    throw conflict('TICKET_EXPIRED', 'Ticket has expired');
  }
  if (ticket.status !== 'active') {
    throw conflict('TICKET_UNAVAILABLE', 'Ticket is unavailable', 404);
  }
}

function isCurrentRunAuthorized(trip, driverId) {
  return Boolean(
    trip
    && String(trip.driver) === String(driverId)
    && !trip.isDeleted
    && trip.driverActive === true
    && ALLOWED_TRIP_STATUSES.includes(trip.status)
  );
}

async function loadDriverCurrentRun(driverId, session) {
  const query = Trip.findOne({
    driver: driverId,
    driverActive: true,
    isDeleted: false,
    status: { $in: ALLOWED_TRIP_STATUSES },
  });
  return session ? query.session(session) : query;
}

function classifyRunForTicket(run, ticket, driverId) {
  if (!run) {
    throw conflict('TRIP_STATE_CONFLICT', 'Trip is not open for validation');
  }
  if (!isCurrentRunAuthorized(run, driverId)) {
    throw conflict('TRIP_STATE_CONFLICT', 'Trip is not open for validation');
  }
  if (!sameId(run.route, ticket.route)) {
    throw conflict('WRONG_ROUTE', 'Ticket belongs to another route');
  }
}

function canAttachAlreadyUsedDisplay({ ticket, claims, run, driverId }) {
  return Boolean(
    ticket?.qr?.tokenHash
    && isAlreadyUsed(ticket)
    && claimsMatchTicket(claims, ticket)
    && isCurrentRunAuthorized(run, driverId)
    && sameId(run.route, ticket.route)
  );
}

async function loadPassengerDisplayName(passengerId, session) {
  const query = User.findById(passengerId).select('fullName');
  const passenger = await (session ? query.session(session) : query);
  const displayName = passenger?.fullName?.trim();
  if (!displayName) {
    throw conflict('TICKET_UNAVAILABLE', 'Ticket is unavailable', 404);
  }
  return displayName;
}

async function incrementTripUse(session, trip, driverId) {
  if (!Number.isSafeInteger(trip.revision) || trip.revision >= MAX_SAFE ||
    !Number.isSafeInteger(trip.stats?.ticketsUsed) || trip.stats.ticketsUsed >= MAX_SAFE) {
    throw conflict('VALIDATION_CONFLICT', 'Trip accounting is unavailable');
  }
  await writeBarriers.beforeTripWrite();
  const updated = await Trip.findOneAndUpdate(
    {
      _id: trip._id,
      driver: driverId,
      driverActive: true,
      isDeleted: false,
      status: { $in: ALLOWED_TRIP_STATUSES },
      revision: trip.revision,
    },
    { $inc: { 'stats.ticketsUsed': 1, revision: 1 } },
    { session, returnDocument: 'after' }
  );
  if (!updated) {
    throw conflict('VALIDATION_CONFLICT', 'Trip changed during validation');
  }
  return updated;
}

async function markTicketUsed(session, { ticket, claims, driverId, eventId, usedAt, trip }) {
  await writeBarriers.beforeTicketWrite();
  const filter = {
    _id: ticket._id,
    route: ticket.route,
    passenger: ticket.passenger,
    status: 'active',
    cancelledAt: null,
    'qr.tokenHash': claims.tokenHash,
    'qr.jti': claims.jti,
    'qr.expiresAt': { $gt: usedAt },
    $or: [
      { validation: { $exists: false } },
      { 'validation.scannedAt': null },
      { 'validation.actionHistory': { $exists: false } },
    ],
  };
  if (ticket.trip) {
    filter.trip = ticket.trip;
  } else {
    filter.$and = [
      ...(filter.$and || []),
      {
        $or: [
          { trip: null },
          { trip: { $exists: false } },
        ],
      },
    ];
  }
  const updated = await Ticket.findOneAndUpdate(
    filter,
    {
      $set: {
        status: 'used',
        trip: trip._id,
        validation: {
          scannedAt: usedAt,
          scannedBy: driverId,
          actionHistory: eventId,
        },
      },
    },
    { session, returnDocument: 'after' }
  );
  if (!updated) {
    throw conflict('VALIDATION_CONFLICT', 'Ticket changed during validation');
  }
  return updated;
}

async function recordTicketUsed(session, event) {
  await writeBarriers.beforeEventWrite();
  await ActionHistory.create([event], { session });
}

async function validateInTransaction({ session, driverId, claims, operationId, inputFingerprint }) {
  const replay = await findReplay(driverId, operationId, inputFingerprint, session);
  if (replay) return replay;
  const { user: driverUser } = await eligibleInSession(driverId, session);

  const ticket = await Ticket.findById(claims.ticketId).session(session);
  if (!ticket) {
    throw conflict('TICKET_UNAVAILABLE', 'Ticket is unavailable', 404);
  }
  if (!claimsMatchTicket(claims, ticket)) {
    throw conflict('INVALID_QR', 'QR token is invalid', 400);
  }

  const run = await loadDriverCurrentRun(driverId, session);
  classifyRunForTicket(run, ticket, driverId);
  if (isAlreadyUsed(ticket)) {
    throw alreadyUsedError(await alreadyUsedDisplay(ticket._id, session));
  }
  const usedAt = new Date();
  classifyTicketState(ticket, usedAt);

  const passengerDisplayName = await loadPassengerDisplayName(ticket.passenger, session);
  const eventId = new mongoose.Types.ObjectId();
  const validationResult = captureValidationSnapshot({
    ticket, trip: run, passengerDisplayName, usedAt,
  });
  await incrementTripUse(session, run, driverId);
  await markTicketUsed(session, { ticket, claims, driverId, eventId, usedAt, trip: run });
  await recordTicketUsed(session, {
    _id: eventId,
    actionType: 'ticket_used',
    actor: driverId,
    actorRole: 'driver',
    ticket: ticket._id,
    trip: run._id,
    operationId,
    inputFingerprint,
    resultingStatus: 'used',
    occurredAt: usedAt,
    validationResult,
  });
  await recordTicketUsedNotification(session, {
    passengerId: ticket.passenger,
    ticket,
    trip: run,
    driverDisplayName: driverUser.fullName.trim(),
  });
  await writeBarriers.beforeCommit();
  return toDriverValidationResult(validationResult, false);
}

async function withTransactionRetry(work) {
  if (!(await deploymentSupportsTransactions())) {
    return runInTransaction(work);
  }

  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    const session = await mongoose.startSession();
    try {
      let workResult;
      await session.withTransaction(async () => {
        workResult = await work(session);
      }, {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      });
      return workResult;
    } catch (error) {
      lastError = error;
      if (error instanceof ApiError || error?.statusCode) throw error;
      if (error?.code === 11000) {
        throw conflict('VALIDATION_CONFLICT', 'Validation could not be completed');
      }
      if (!isTransientTransactionError(error) || attempt === MAX_RETRIES) {
        throw conflict('VALIDATION_CONFLICT', 'Validation could not be completed');
      }
    } finally {
      await session.endSession();
    }
  }
  throw lastError;
}

async function validateTicket(driverId, { qrToken }) {
  const claims = verifyPresentedQrToken(qrToken);
  const inputFingerprint = fingerprint(claims.tokenHash);
  const operationId = createOperationId();
  try {
    return await withTransactionRetry((session) => validateInTransaction({
      session, driverId, claims, operationId, inputFingerprint,
    }));
  } catch (error) {
    if (error?.code === 11000 || error?.details?.code === 'VALIDATION_CONFLICT') {
      const replay = await findReplay(driverId, operationId, inputFingerprint).catch((replayError) => {
        if (replayError?.details?.code === 'OPERATION_KEY_REUSED') throw replayError;
        return null;
      });
      if (replay) return replay;
      const used = await Ticket.findById(claims.ticketId);
      if (used && isAlreadyUsed(used)) {
        const run = await loadDriverCurrentRun(driverId);
        if (canAttachAlreadyUsedDisplay({ ticket: used, claims, run, driverId })) {
          throw alreadyUsedError(await alreadyUsedDisplay(used._id));
        }
        throw conflict('TICKET_ALREADY_USED', 'Ticket has already been used');
      }
    }
    throw error;
  }
}

async function resolveEligibleTicketForDriver(driverId, qrToken) {
  const claims = verifyPresentedQrToken(qrToken);
  const ticket = await Ticket.findById(claims.ticketId);
  if (!ticket) {
    throw conflict('TICKET_UNAVAILABLE', 'Ticket is unavailable', 404);
  }
  if (!claimsMatchTicket(claims, ticket)) {
    throw conflict('INVALID_QR', 'QR token is invalid', 400);
  }

  const run = await loadDriverCurrentRun(driverId);
  classifyRunForTicket(run, ticket, driverId);

  if (isAlreadyUsed(ticket)) {
    throw alreadyUsedError(await alreadyUsedDisplay(ticket._id));
  }
  classifyTicketState(ticket, new Date());

  return { ticket, run };
}

async function previewTicket(driverId, { qrToken }) {
  const { ticket, run } = await resolveEligibleTicketForDriver(driverId, qrToken);
  const passengerDisplayName = await loadPassengerDisplayName(ticket.passenger);
  return toDriverTicketPreview(
    capturePreviewSnapshot({ ticket, trip: run, passengerDisplayName })
  );
}

function toDriverTicketPreview(snapshot) {
  const displayName = String(snapshot?.passengerDisplayName || '').trim();
  const ticketId = snapshot?.ticketId && String(snapshot.ticketId);
  const tripId = snapshot?.tripId && String(snapshot.tripId);
  if (!ticketId || !tripId || !displayName) {
    throw new ApiError(404, 'Ticket is unavailable', { code: 'TICKET_UNAVAILABLE' });
  }
  return {
    ticket: {
      ticketId,
      tripId,
      passenger: { displayName },
      ...storedJourneyDisplay(snapshot),
    },
  };
}

function toDriverValidationResult(snapshot, replayed) {
  const displayName = String(snapshot?.passengerDisplayName || '').trim();
  const ticketId = snapshot?.ticketId && String(snapshot.ticketId);
  const tripId = snapshot?.tripId && String(snapshot.tripId);
  const usedAt = snapshot?.usedAt ? new Date(snapshot.usedAt) : null;
  if (!ticketId || !tripId || !displayName || !usedAt || Number.isNaN(usedAt.getTime())) {
    throw new ApiError(404, 'Ticket is unavailable', { code: 'TICKET_UNAVAILABLE' });
  }
  return {
    replayed: Boolean(replayed),
    validation: {
      ticketId,
      tripId,
      passenger: { displayName },
      usedAt: usedAt.toISOString(),
      ...storedJourneyDisplay(snapshot),
    },
  };
}

module.exports = {
  validateTicket,
  previewTicket,
  setWriteBarriers,
  canAttachAlreadyUsedDisplay,
  toDriverTicketPreview,
  toDriverValidationResult,
};
