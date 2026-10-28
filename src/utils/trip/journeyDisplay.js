'use strict';

const LABEL_PATTERN = /^[\p{L}\p{M}\p{N} ]+$/u;
const LABEL_MAX_LENGTH = 40;

function nullableTrimmedText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function nullableDistanceMeters(value) {
  if (value == null) return null;
  if (!Number.isSafeInteger(value) || value < 1) return null;
  return value;
}

function nullableFareMinor(value) {
  if (!Number.isSafeInteger(value) || value < 0) return null;
  return value;
}

function routeCatalogDisplay(route) {
  return {
    lineLabel: nullableTrimmedText(route?.lineLabel),
    distanceMeters: nullableDistanceMeters(route?.distanceMeters),
  };
}

function runJourneyDisplay(trip) {
  return {
    lineLabel: nullableTrimmedText(trip?.lineLabel),
    distanceMeters: nullableDistanceMeters(trip?.distanceMeters),
    vehicleLabel: nullableTrimmedText(trip?.vehicleLabel),
  };
}

function storedJourneyDisplay(snapshot) {
  return {
    ticketCode: nullableTrimmedText(snapshot?.ticketCode),
    origin: nullableTrimmedText(snapshot?.origin),
    destination: nullableTrimmedText(snapshot?.destination),
    lineLabel: nullableTrimmedText(snapshot?.lineLabel),
    vehicleLabel: nullableTrimmedText(snapshot?.vehicleLabel),
    fareMinor: nullableFareMinor(snapshot?.fareMinor),
    currency: typeof snapshot?.currency === 'string' ? snapshot.currency : null,
    status: nullableTrimmedText(snapshot?.status),
  };
}

module.exports = {
  LABEL_MAX_LENGTH,
  LABEL_PATTERN,
  routeCatalogDisplay,
  runJourneyDisplay,
  storedJourneyDisplay,
};
