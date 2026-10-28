'use strict';

const mongoose = require('mongoose');
const { Trip, Ticket, ActionHistory, Route } = require('../../models');
const ApiError = require('../../utils/shared/ApiError');
const { generateTicketCode, generateReceiptCode } = require('../../utils/ticket/ticketCodes');
const { parsePagination, paginationMeta } = require('../../utils/shared/pagination');
const { toPublicTrip } = require('../trip/trip.service');
const {
  computeQrDeadline,
  signQrToken,
  renderQrPng,
} = require('../../utils/ticket/qrToken');
const {
  uploadTicketQr,
  deleteImage,
  ticketQrDownloadUrl,
} = require('../../utils/shared/cloudinary');
const { routeCatalogDisplay } = require('../../utils/trip/journeyDisplay');
const {
  recordBookingNotifications,
  ensureNotificationCollection,
} = require('../shared/notification.service');
const { runInTransaction } = require('../../utils/shared/runInTransaction');

const MAX_CODE_ATTEMPTS = 3;
const QR_LINK_TTL_SECONDS = 300;

function isDuplicateKey(err, field) {
  return (
    err &&
    err.code === 11000 &&
    err.keyPattern &&
    Object.prototype.hasOwnProperty.call(err.keyPattern, field)
  );
}

function isMongoWriteError(err) {
  return Boolean(
    err &&
      (err.name === 'MongoServerError' ||
        err.name === 'MongoError' ||
        err.name === 'MongooseError' ||
        err.name === 'ValidationError')
  );
}

function tripRevisionMatch(revision) {
  if (revision === 0) {
    return { revision: { $in: [0, null] } };
  }
  return { revision };
}

function assertActiveTicketAccess(ticket, now = new Date()) {
  const denied = deniedTicketAccessStatus(ticket, now);
  if (denied) {
    throw new ApiError(409, `Ticket is ${denied}`);
  }
}

function buildReceiptSnapshot({ ticket, route, passenger }) {
  const display = routeCatalogDisplay(route);
  return {
    ticketCode: ticket.ticketCode,
    origin: route.origin,
    destination: route.destination,
    lineLabel: display.lineLabel,
    vehicleLabel: null,
    fareMinor: ticket.fareMinor,
    currency: ticket.currency,
    passengerName: passenger.fullName || null,
    passengerPhone: passenger.phone || null,
    driverName: null,
    paymentStatus: ticket.paymentStatus,
  };
}

async function loadBookableRoute(routeId) {
  const route = await Route.findOne({ _id: routeId, isActive: true });
  if (!route) {
    throw new ApiError(404, 'Route not found');
  }
  return route;
}

async function buildSignedQrArtifact({
  ticketId,
  ticketCode,
  route,
  passengerId,
}) {
  const issuedAt = new Date();
  const expiresAt = computeQrDeadline(issuedAt);
  const signed = signQrToken({
    ticketId,
    ticketCode,
    routeId: route._id,
    passengerId,
    fareMinor: route.defaultFareMinor,
    currency: route.currency,
    status: 'active',
    issuedAt,
    expiresAt,
  });
  const png = await renderQrPng(signed.token);
  const uploaded = await uploadTicketQr(png, { ticketId: String(ticketId) });
  return { signed, uploaded };
}

async function createBookingTicket(session, fields) {
  const [ticket] = await Ticket.create([fields], { session });
  return ticket;
}

async function recordTicketBooked(session, event) {
  await ActionHistory.create([event], { session });
}

async function claimRouteForBooking(session, route) {
  if (
    route.bookingFence != null
    && (!Number.isSafeInteger(route.bookingFence) || route.bookingFence >= Number.MAX_SAFE_INTEGER)
  ) {
    throw new ApiError(409, 'Route accounting is unavailable');
  }
  const claimed = await Route.findOneAndUpdate(
    {
      _id: route._id,
      isActive: true,
      $or: [
        { bookingFence: { $exists: false } },
        { bookingFence: { $lt: Number.MAX_SAFE_INTEGER } },
      ],
    },
    { $inc: { bookingFence: 1 } },
    { session, returnDocument: 'after' }
  );
  if (!claimed) {
    throw new ApiError(409, 'Route is not available');
  }
  return claimed;
}

async function commitBooking({
  session,
  route,
  passenger,
  ticketId,
  ticketCode,
  signed,
  uploaded,
  receiptCode,
}) {
  const claimedRoute = await claimRouteForBooking(session, route);

  const ticket = await createBookingTicket(session, {
    _id: ticketId,
    passenger: passenger._id,
    trip: null,
    route: claimedRoute._id,
    fareMinor: claimedRoute.defaultFareMinor,
    currency: claimedRoute.currency,
    ticketCode,
    qr: {
      payload: signed.payload,
      tokenHash: signed.tokenHash,
      jti: signed.jti,
      expiresAt: signed.expiresAt,
      imageUrl: uploaded.url,
      imagePublicId: uploaded.publicId,
    },
    status: 'active',
    paymentStatus: 'unpaid',
  });

  await recordTicketBooked(session, {
    actionType: 'ticket_booked',
    actor: passenger._id,
    actorRole: 'passenger',
    ticket: ticket._id,
    trip: null,
    receiptCode,
    receipt: buildReceiptSnapshot({ ticket, route: claimedRoute, passenger }),
  });
  await recordBookingNotifications(session, {
    passengerId: passenger._id,
    ticket,
    route: claimedRoute,
    receiptCode,
  });

  return ticket;
}

function buildBookingResponse({ ticketDoc, receiptCode, signed, uploaded }) {
  return {
    ticket: toPublicTicket(ticketDoc),
    receiptCode,
    qrToken: signed.token,
    qrDownloadUrl: ticketQrDownloadUrl(uploaded.publicId, {
      ttlSeconds: QR_LINK_TTL_SECONDS,
    }),
  };
}

async function cleanupFailedQrUpload(uploaded) {
  if (!uploaded?.publicId) {
    return;
  }
  await deleteImage(uploaded.publicId, { type: 'authenticated' }).catch(() => {});
}

async function persistBookingTransaction(params) {
  await ensureNotificationCollection();
  let ticket;
  await runInTransaction(async (session) => {
    ticket = await commitBooking({ ...params, session });
  });
  return ticket;
}

async function attemptOneBooking({ route, passenger }) {
  const ticketId = new mongoose.Types.ObjectId();
  const ticketCode = generateTicketCode();
  const receiptCode = generateReceiptCode();
  let uploaded = null;

  try {
    const artifact = await buildSignedQrArtifact({
      ticketId,
      ticketCode,
      route,
      passengerId: passenger._id,
    });
    uploaded = artifact.uploaded;

    const ticket = await persistBookingTransaction({
      route,
      passenger,
      ticketId,
      ticketCode,
      signed: artifact.signed,
      uploaded,
      receiptCode,
    });

    const populated = await Ticket.findById(ticket._id)
      .populate('trip')
      .populate('route', 'origin destination lineLabel distanceMeters')
      .lean();

    return buildBookingResponse({
      ticketDoc: populated,
      receiptCode,
      signed: artifact.signed,
      uploaded,
    });
  } catch (err) {
    await cleanupFailedQrUpload(uploaded);
    throw err;
  }
}

async function bookTicket(passenger, { routeId }) {
  const route = await loadBookableRoute(routeId);
  let lastError;
  for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt += 1) {
    try {
      return await attemptOneBooking({ route, passenger });
    } catch (err) {
      if (
        isDuplicateKey(err, 'ticketCode') ||
        isDuplicateKey(err, 'receiptCode')
      ) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }

  throw lastError || new ApiError(500, 'Failed to issue ticket code');
}

async function findOwnedTicket(ticketId, passengerId) {
  const ticket = await Ticket.findOne({
    _id: ticketId,
    passenger: passengerId,
  })
    .populate('trip')
    .populate('route', 'origin destination lineLabel distanceMeters')
    .lean();

  if (!ticket) {
    throw new ApiError(404, 'Ticket not found');
  }
  return ticket;
}

async function listTickets(passengerId, query) {
  const pagination = parsePagination(query);
  const filter = { passenger: passengerId };

  if (query.ticketCode) {
    filter.ticketCode = query.ticketCode;
  }

  if (query.status === 'expired') {
    filter.status = 'active';
    filter['qr.expiresAt'] = { $lt: new Date() };
  } else if (query.status === 'active') {
    filter.status = 'active';
    filter['qr.expiresAt'] = { $gte: new Date() };
  } else if (query.status) {
    filter.status = query.status;
  }

  const [total, tickets] = await Promise.all([
    Ticket.countDocuments(filter),
    Ticket.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .populate('trip')
      .populate('route', 'origin destination lineLabel distanceMeters')
      .lean(),
  ]);

  return {
    tickets: tickets.map(toPublicTicket),
    meta: paginationMeta({ ...pagination, total }),
  };
}

async function getTicket(passengerId, ticketId) {
  const ticket = await findOwnedTicket(ticketId, passengerId);
  const bookedEvent = await resolveOriginalBookingReceipt(ticketId, {
    required: false,
  });
  return toDetailedPublicTicket(ticket, bookedEvent);
}

async function getTicketQrLink(passengerId, ticketId) {
  const ticket = await findOwnedTicket(ticketId, passengerId);
  assertActiveTicketAccess(ticket);
  if (!ticket.qr?.imagePublicId) {
    throw new ApiError(404, 'QR image not available');
  }

  return {
    downloadUrl: ticketQrDownloadUrl(ticket.qr.imagePublicId, {
      ttlSeconds: QR_LINK_TTL_SECONDS,
    }),
    expiresInSeconds: QR_LINK_TTL_SECONDS,
  };
}

function activeTicketCancelFilter(ticketId, passengerId, now) {
  return {
    _id: ticketId,
    passenger: passengerId,
    status: 'active',
    cancelledAt: null,
    $or: [
      { validation: { $exists: false } },
      { 'validation.scannedAt': null },
      { 'validation.actionHistory': { $exists: false } },
    ],
    $and: [{
      $or: [
        { 'qr.expiresAt': { $exists: false } },
        { 'qr.expiresAt': null },
        { 'qr.expiresAt': { $gte: now } },
      ],
    }],
  };
}

async function markTicketCancelled(session, ticketId, passengerId, cancelledAt) {
  const updated = await Ticket.findOneAndUpdate(
    activeTicketCancelFilter(ticketId, passengerId, cancelledAt),
    { $set: { status: 'cancelled', cancelledAt } },
    { returnDocument: 'after', session }
  );
  if (!updated) {
    throw new ApiError(409, 'Ticket is no longer active');
  }
  return updated;
}

async function incrementCancelledOnOpenTrip(session, trip) {
  if (!Number.isSafeInteger(trip.revision) || trip.revision >= Number.MAX_SAFE_INTEGER ||
    !Number.isSafeInteger(trip.stats.ticketsCancelled) || trip.stats.ticketsCancelled >= Number.MAX_SAFE_INTEGER) {
    throw new ApiError(409, 'Trip accounting is unavailable');
  }
  const touched = await Trip.findOneAndUpdate(
    {
      _id: trip._id,
      isDeleted: false,
      completedAt: null,
      status: { $in: ['boarding', 'withdrawn', 'in_progress'] },
      ...tripRevisionMatch(trip.revision),
    },
    { $inc: { 'stats.ticketsCancelled': 1, revision: 1 } },
    { session }
  );
  if (!touched) {
    throw new ApiError(409, 'Trip has already started or ended');
  }
}

async function recordTicketCancelled(
  session,
  { passengerId, ticketId, tripId, cancelledAt }
) {
  await ActionHistory.create(
    [
      {
        actionType: 'ticket_cancelled',
        actor: passengerId,
        actorRole: 'passenger',
        ticket: ticketId,
        trip: tripId || null,
        occurredAt: cancelledAt,
      },
    ],
    { session }
  );
}

async function cancelTicket(passengerId, ticketId) {
  const ticket = await Ticket.findOne({
    _id: ticketId,
    passenger: passengerId,
  });

  if (!ticket) {
    throw new ApiError(404, 'Ticket not found');
  }

  assertActiveTicketAccess(ticket);

  await runInTransaction(async (session) => {
      const now = new Date();
      const fresh = await Ticket.findOne({
        _id: ticketId,
        passenger: passengerId,
      }).session(session);

      if (!fresh) {
        throw new ApiError(404, 'Ticket not found');
      }
      assertActiveTicketAccess(fresh, now);

      const tripId = fresh.trip || null;
      if (tripId) {
        const currentTrip = await Trip.findById(tripId).session(session);
        if (currentTrip && !currentTrip.isDeleted && !currentTrip.completedAt) {
          await incrementCancelledOnOpenTrip(session, currentTrip);
        }
      }
      await markTicketCancelled(session, ticketId, passengerId, now);
      await recordTicketCancelled(session, {
        passengerId,
        ticketId: fresh._id,
        tripId,
        cancelledAt: now,
      });
  });

  const refreshed = await findOwnedTicket(ticketId, passengerId);
  return toPublicTicket(refreshed);
}

/**
 * Original ticket_booked receipt. Multiple conflicting originals are an integrity
 * failure — never silently pick by recency.
 */
async function resolveOriginalBookingReceipt(ticketId, { required = true } = {}) {
  const events = await ActionHistory.find({
    ticket: ticketId,
    actionType: 'ticket_booked',
  }).lean();

  if (events.length > 1) {
    throw new ApiError(409, 'Ambiguous booking receipt');
  }

  const booked = events[0];
  if (!booked || !booked.receipt) {
    if (required) {
      throw new ApiError(404, 'Booking receipt not found');
    }
    return null;
  }
  return booked;
}

async function loadBookingReceipt(ticketId) {
  return resolveOriginalBookingReceipt(ticketId, { required: true });
}

async function recordReceiptViewed({ passengerId, ticketId, tripId }) {
  try {
    await ActionHistory.create({
      actionType: 'receipt_viewed',
      actor: passengerId,
      actorRole: 'passenger',
      ticket: ticketId,
      trip: tripId || null,
      receiptCode: null,
    });
  } catch (err) {
    if (!isMongoWriteError(err)) {
      throw err;
    }
  }
}

async function viewTicketReceipt(passengerId, ticketId) {
  const ticket = await findOwnedTicket(ticketId, passengerId);
  const booked = await loadBookingReceipt(ticketId);
  const viewedAt = new Date();
  await recordReceiptViewed({
    passengerId,
    ticketId,
    tripId: booked.trip,
  });

  return toPublicReceipt({
    receiptCode: booked.receiptCode,
    receipt: booked.receipt,
    ticket,
    viewedAt,
  });
}

function effectiveTicketStatus(ticket, now = new Date()) {
  if (
    ticket.status === 'active' &&
    ticket.qr?.expiresAt &&
    new Date(ticket.qr.expiresAt) < now
  ) {
    return 'expired';
  }
  return ticket.status;
}

function isActiveTicket(ticket, now = new Date()) {
  return effectiveTicketStatus(ticket, now) === 'active';
}

function deniedTicketAccessStatus(ticket, now = new Date()) {
  const status = effectiveTicketStatus(ticket, now);
  return status === 'active' ? null : status;
}

function toPublicRouteSummary(route) {
  if (!route) return null;
  if (typeof route === 'object' && route.origin !== undefined) {
    return {
      id: route._id,
      origin: route.origin,
      destination: route.destination,
    };
  }
  return { id: route };
}

function toPublicTicket(ticket) {
  const trip =
    ticket.trip && typeof ticket.trip === 'object' && ticket.trip.route
      ? toPublicTrip(ticket.trip)
      : ticket.trip
        ? { id: ticket.trip }
        : null;

  return {
    id: ticket._id,
    ticketCode: ticket.ticketCode,
    passenger: ticket.passenger,
    trip,
    route: toPublicRouteSummary(ticket.route),
    fareMinor: ticket.fareMinor,
    currency: ticket.currency,
    status: effectiveTicketStatus(ticket),
    paymentStatus: ticket.paymentStatus,
    qr: {
      expiresAt: ticket.qr?.expiresAt || null,
      hasImage: Boolean(ticket.qr?.imagePublicId),
    },
    cancelledAt: ticket.cancelledAt,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  };
}

function toDetailedPublicTicket(ticket, bookedEvent) {
  const base = toPublicTicket(ticket);
  const routeId =
    ticket.route && typeof ticket.route === 'object'
      ? ticket.route._id
      : ticket.route || null;

  if (!bookedEvent?.receipt) {
    return {
      ...base,
      route: routeId ? { id: routeId, origin: null, destination: null, lineLabel: null } : null,
      vehicleLabel: null,
      bookingDetailsStatus: 'unavailable',
    };
  }

  const receipt = bookedEvent.receipt;
  return {
    ...base,
    fareMinor: receipt.fareMinor ?? base.fareMinor,
    currency: receipt.currency ?? base.currency,
    route: {
      id: routeId,
      origin: receipt.origin ?? null,
      destination: receipt.destination ?? null,
      lineLabel: receipt.lineLabel ?? null,
    },
    vehicleLabel: receipt.vehicleLabel ?? null,
    bookingDetailsStatus: 'available',
  };
}

function toPublicReceipt({ receiptCode, receipt, ticket, viewedAt }) {
  return {
    receiptCode: receiptCode ?? null,
    receipt: {
      ticketCode: receipt?.ticketCode ?? null,
      origin: receipt?.origin ?? null,
      destination: receipt?.destination ?? null,
      fareMinor: receipt?.fareMinor ?? null,
      currency: receipt?.currency ?? null,
      paymentMethod: 'cash_to_driver',
      paymentStatus: receipt?.paymentStatus ?? null,
      status: ticket ? effectiveTicketStatus(ticket) : null,
    },
    viewedAt: viewedAt ?? null,
  };
}

module.exports = {
  bookTicket,
  listTickets,
  getTicket,
  getTicketQrLink,
  cancelTicket,
  viewTicketReceipt,
  effectiveTicketStatus,
  isActiveTicket,
  deniedTicketAccessStatus,
  toDetailedPublicTicket,
};
