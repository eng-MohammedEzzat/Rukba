'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const env = require('../../config/env');
const ApiError = require('../shared/ApiError');
const { hashToken } = require('../auth/tokens');

function buildQrPayload({
  ticketId,
  ticketCode,
  tripId,
  routeId,
  passengerId,
  fareMinor,
  currency,
  status,
  issuedAt,
  expiresAt,
}) {
  const payload = {
    ticketId: String(ticketId),
    ticketCode: String(ticketCode).toUpperCase(),
    routeId: String(routeId),
    passengerId: String(passengerId),
    fareMinor,
    currency,
    status,
    issuedAt,
    expiresAt,
  };
  if (tripId != null && tripId !== '') {
    payload.tripId = String(tripId);
  }
  return payload;
}

function computeQrDeadline(issuedAt = new Date(), ttlMinutes = env.qrTtlMinutes) {
  const issuedMs = new Date(issuedAt).getTime();
  const ttlMs = ttlMinutes * 60 * 1000;
  return new Date(issuedMs + ttlMs);
}

/**
 * Sign a QR JWT. expiresIn is relative seconds; payload.expiresAt is absolute.
 * @returns {{ token: string, tokenHash: string, jti: string, expiresAt: Date, payload: object }}
 */
function signQrToken(claims) {
  const expiresAt = new Date(claims.expiresAt);
  const expiresInSeconds = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
  if (!Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
    throw new ApiError(409, 'Trip QR window has already expired');
  }

  const jti = crypto.randomUUID();
  const payload = buildQrPayload(claims);
  const token = jwt.sign(
    { ...payload, typ: 'qr', jti },
    env.qrSecret,
    { expiresIn: expiresInSeconds }
  );

  return {
    token,
    tokenHash: hashToken(token),
    jti,
    expiresAt,
    payload,
  };
}

function renderQrPng(token) {
  return QRCode.toBuffer(token, {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 512,
  });
}

const OBJECT_ID = /^[a-fA-F0-9]{24}$/;
const REQUIRED_QR_CLAIMS = [
  'ticketId', 'ticketCode', 'routeId', 'passengerId',
  'fareMinor', 'currency', 'status', 'issuedAt', 'expiresAt', 'jti', 'typ',
];

function asDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function invalidQr() {
  return new ApiError(400, 'QR token is invalid', { code: 'INVALID_QR' });
}

/**
 * Authenticate a presented QR without using JWT whole-second expiry as the
 * business cutoff. Returns identity claims and a one-way hash only.
 */
function verifyPresentedQrToken(token) {
  if (typeof token !== 'string' || token.length < 64 || token.length > 8192 || token !== token.trim()) {
    throw invalidQr();
  }

  let decoded;
  try {
    decoded = jwt.verify(token, env.qrSecret, { ignoreExpiration: true });
  } catch {
    throw invalidQr();
  }

  if (!decoded || typeof decoded !== 'object' || decoded.typ !== 'qr') {
    throw invalidQr();
  }
  for (const claim of REQUIRED_QR_CLAIMS) {
    if (decoded[claim] === undefined || decoded[claim] === null || decoded[claim] === '') {
      throw invalidQr();
    }
  }
  const requiredIds = [decoded.ticketId, decoded.routeId, decoded.passengerId];
  if (!requiredIds.every((id) => OBJECT_ID.test(String(id)))) {
    throw invalidQr();
  }
  if (decoded.tripId != null && decoded.tripId !== '') {
    if (!OBJECT_ID.test(String(decoded.tripId))) {
      throw invalidQr();
    }
  }
  if (!Number.isInteger(decoded.fareMinor) || decoded.fareMinor < 0) {
    throw invalidQr();
  }

  const expiresAt = asDate(decoded.expiresAt);
  const issuedAt = asDate(decoded.issuedAt);
  if (!expiresAt || !issuedAt || expiresAt < issuedAt) {
    throw invalidQr();
  }
  if (typeof decoded.exp === 'number') {
    const claimSeconds = Math.ceil(expiresAt.getTime() / 1000);
    if (decoded.exp > claimSeconds + 1) {
      throw invalidQr();
    }
  }

  return {
    ticketId: String(decoded.ticketId),
    ticketCode: String(decoded.ticketCode).toUpperCase(),
    tripId: decoded.tripId != null && decoded.tripId !== '' ? String(decoded.tripId) : null,
    routeId: String(decoded.routeId),
    passengerId: String(decoded.passengerId),
    fareMinor: decoded.fareMinor,
    currency: String(decoded.currency),
    status: String(decoded.status),
    issuedAt,
    expiresAt,
    jti: String(decoded.jti),
    tokenHash: hashToken(token),
  };
}

module.exports = {
  computeQrDeadline,
  signQrToken,
  renderQrPng,
  verifyPresentedQrToken,
};
