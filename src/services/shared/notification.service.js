'use strict';

const { Notification } = require('../../models');
const ApiError = require('../../utils/shared/ApiError');
const { parsePagination, paginationMeta } = require('../../utils/shared/pagination');

let collectionReady = false;

async function ensureNotificationCollection() {
  if (collectionReady) return;
  try {
    await Notification.createCollection();
  } catch (err) {
    if (err.code !== 48 && err.codeName !== 'NamespaceExists') throw err;
  }
  await Notification.init();
  collectionReady = true;
}

function ownerFilter(userId) {
  return { user: userId };
}

async function listNotifications(userId, query) {
  const pagination = parsePagination(query, { maxLimit: 50 });
  const owner = ownerFilter(userId);
  const filter = query.unread ? { ...owner, readAt: null } : owner;

  const [total, unreadCount, rows] = await Promise.all([
    Notification.countDocuments(filter),
    Notification.countDocuments({ ...owner, readAt: null }),
    Notification.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
  ]);

  return {
    notifications: rows.map(toPublicNotification),
    unreadCount,
    meta: paginationMeta({ ...pagination, total }),
  };
}

function notificationNotFound() {
  return new ApiError(404, 'Notification not found', { code: 'NOTIFICATION_NOT_FOUND' });
}

async function markNotificationRead(userId, notificationId) {
  const updated = await Notification.findOneAndUpdate(
    { _id: notificationId, user: userId, readAt: null },
    { $set: { readAt: new Date() } },
    { returnDocument: 'after' }
  );
  if (updated) {
    return toPublicNotification(updated);
  }
  const existing = await Notification.findOne({
    _id: notificationId,
    user: userId,
  });
  if (!existing) {
    throw notificationNotFound();
  }
  return toPublicNotification(existing);
}

function bookingNotificationDocs({ passengerId, ticket, route, receiptCode }) {
  const refs = {
    ticketId: ticket._id,
    tripId: null,
    routeId: route._id || route,
  };
  return [
    {
      user: passengerId,
      type: 'ticket_issued',
      title: 'New ticket',
      body: `Ticket ${ticket.ticketCode} is ready`,
      eventKey: `ticket_issued:${ticket._id}`,
      refs,
    },
    {
      user: passengerId,
      type: 'receipt_issued',
      title: 'Receipt issued',
      body: `Receipt ${receiptCode} is available`,
      eventKey: `receipt_issued:${ticket._id}`,
      refs,
    },
  ];
}

async function recordBookingNotifications(session, fields) {
  await recordNotifications(session, bookingNotificationDocs(fields));
}

function ticketUsedNotificationDoc({ passengerId, ticket, trip, driverDisplayName }) {
  return {
    user: passengerId,
    type: 'ticket_used',
    title: 'Ticket scanned',
    body: `Ticket ${ticket.ticketCode} was scanned by the driver ${driverDisplayName}`,
    eventKey: `ticket_used:${ticket._id}`,
    refs: {
      ticketId: ticket._id,
      tripId: trip._id,
      routeId: ticket.route,
    },
  };
}

async function recordTicketUsedNotification(session, fields) {
  await recordNotifications(session, [ticketUsedNotificationDoc(fields)]);
}

async function recordNotifications(session, notificationDocs) {
  try {
    await Notification.create(notificationDocs, {
      session,
      ordered: true,
    });
  } catch (err) {
    if (err.code !== 11000) throw err;
  }
}

function publicRefId(value) {
  if (!value) return null;
  const text = String(value);
  return /^[a-fA-F0-9]{24}$/.test(text) ? text : null;
}

function toPublicNotification(row) {
  return {
    id: String(row._id),
    type: row.type,
    title: row.title || '',
    body: row.body || '',
    createdAt: row.createdAt,
    readAt: row.readAt || null,
    refs: {
      ticketId: publicRefId(row.refs?.ticketId),
      tripId: publicRefId(row.refs?.tripId),
      routeId: publicRefId(row.refs?.routeId),
    },
  };
}

module.exports = {
  listNotifications,
  markNotificationRead,
  recordBookingNotifications,
  recordTicketUsedNotification,
  ensureNotificationCollection,
  toPublicNotification,
};
