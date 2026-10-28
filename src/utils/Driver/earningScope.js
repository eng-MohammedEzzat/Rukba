'use strict';

const mongoose = require('mongoose');
const { asObjectIdString } = require('./earningIntegrity');

async function duplicateTripIds(db, rows, session) {
  const tripIds = [...new Set(rows.map((row) => asObjectIdString(row.trip)).filter(Boolean))]
    .map((id) => new mongoose.Types.ObjectId(id));
  if (!tripIds.length) return new Set();
  const counts = await db.collection('earnings').aggregate([
    { $match: { trip: { $in: tripIds } } },
    { $group: { _id: '$trip', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ], { session }).toArray();
  return new Set(counts.map((item) => String(item._id)));
}

async function loadTripOwners(db, rows, session) {
  const tripIds = [...new Set(rows.map((row) => asObjectIdString(row.trip)).filter(Boolean))]
    .map((id) => new mongoose.Types.ObjectId(id));
  if (!tripIds.length) return new Map();
  const trips = await db.collection('trips').find(
    { _id: { $in: tripIds } },
    { session, projection: { _id: 1, driver: 1 } }
  ).toArray();
  return new Map(trips.map((trip) => [String(trip._id), asObjectIdString(trip.driver)]));
}

module.exports = { duplicateTripIds, loadTripOwners };
