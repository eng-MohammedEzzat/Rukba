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
  return new ApiError(404, 'الإشعار غير موجود', { code: 'NOTIFICATION_NOT_FOUND' });
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
      title: 'تذكرة جديدة',
      body: `تذكرتك ${ticket.ticketCode} جاهزة`,
      eventKey: `ticket_issued:${ticket._id}`,
      refs,
    },
    {
      user: passengerId,
      type: 'receipt_issued',
      title: 'تم إصدار الإيصال',
      body: `الإيصال ${receiptCode} متاح الآن`,
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
    title: 'تم مسح التذكرة',
    body: `قام السائق ${driverDisplayName} بمسح التذكرة ${ticket.ticketCode}`,
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

function formatShekels(amountMinor) {
  return `${(amountMinor / 100).toFixed(2)} ₪`;
}

async function recordDriverApplicationDecision(session, { driverId, profileId, outcome, rejectionReason }) {
  const approved = outcome === 'approved';
  await recordNotifications(session, [{
    user: driverId,
    type: approved ? 'driver_application_approved' : 'driver_application_rejected',
    title: approved ? 'تم قبول طلبك' : 'تم رفض طلبك',
    body: approved
      ? 'تمت الموافقة على حسابك كسائق، يمكنك الآن بدء الرحلات'
      : `تم رفض طلب انضمامك كسائق. السبب: ${rejectionReason}`,
    eventKey: `driver_application:${profileId}`,
  }]);
}

async function recordTripCompletedNotification(session, { driverId, trip, ticketCount, creditedMinor }) {
  const credited = creditedMinor > 0 ? ` وأُضيف ${formatShekels(creditedMinor)} إلى محفظتك` : '';
  await recordNotifications(session, [{
    user: driverId,
    type: 'trip_completed',
    title: 'اكتملت الرحلة',
    body: `اكتملت رحلة ${trip.routeOrigin} - ${trip.routeDestination} بعدد ${ticketCount} تذكرة${credited}`,
    eventKey: `trip_completed:${trip._id}`,
    refs: { ticketId: null, tripId: trip._id, routeId: trip.route },
  }]);
}

async function recordPayoutNotification(session, { driverId, transaction }) {
  await recordNotifications(session, [{
    user: driverId,
    type: 'payout_completed',
    title: 'تم تحويل الأرباح',
    body: `تم سحب ${formatShekels(transaction.amountMinor)} من محفظتك`,
    eventKey: `payout:${transaction._id}`,
  }]);
}

async function recordPasswordChangedNotification(session, { userId, via, at }) {
  await recordNotifications(session, [{
    user: userId,
    type: 'password_changed',
    title: 'تم تغيير كلمة المرور',
    body: via === 'reset'
      ? 'تمت إعادة تعيين كلمة المرور وتسجيل الخروج من جميع الأجهزة. إن لم تكن أنت، تواصل مع الدعم فورًا'
      : 'تم تغيير كلمة المرور وتسجيل الخروج من الأجهزة الأخرى. إن لم تكن أنت، تواصل مع الدعم فورًا',
    eventKey: `password_changed:${userId}:${at.getTime()}`,
  }]);
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
  recordDriverApplicationDecision,
  recordTripCompletedNotification,
  recordPayoutNotification,
  recordPasswordChangedNotification,
  ensureNotificationCollection,
  toPublicNotification,
};
