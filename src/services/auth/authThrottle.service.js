'use strict';

const { AuthFailureCounter } = require('../../models');
const ApiError = require('../../utils/shared/ApiError');
const env = require('../../config/env');

const EPOCH = new Date(0);

function retryAfterSeconds(lockedUntil, now = Date.now()) {
  if (!lockedUntil) {
    return 0;
  }
  return Math.max(0, Math.ceil((new Date(lockedUntil).getTime() - now) / 1000));
}

function limitsFor(scope) {
  return scope === 'ip'
    ? { maxAttempts: env.authFailIpMax, lockMs: env.authFailIpLockMs }
    : { maxAttempts: env.authFailAccountMax, lockMs: env.authFailAccountLockMs };
}

function windowIsActive(now) {
  return {
    $gte: [
      { $ifNull: ['$windowStartedAt', EPOCH] },
      new Date(now.getTime() - env.authFailWindowMs),
    ],
  };
}

function restrictionIsExpired(now) {
  return {
    $and: [
      { $ne: [{ $ifNull: ['$lockedUntil', null] }, null] },
      { $lte: ['$lockedUntil', now] },
    ],
  };
}

function currentCount(field, now) {
  return {
    $cond: [windowIsActive(now), { $ifNull: [`$${field}`, 0] }, 0],
  };
}

function reservationFilter(entry, now, maxAttempts) {
  return {
    key: entry.key,
    $expr: {
      $and: [
        { $lte: [{ $ifNull: ['$lockedUntil', EPOCH] }, now] },
        {
          $or: [
            restrictionIsExpired(now),
            {
              $lt: [
                {
                  $add: [
                    currentCount('failCount', now),
                    currentCount('pendingCount', now),
                  ],
                },
                maxAttempts,
              ],
            },
          ],
        },
      ],
    },
  };
}

function reservationPipeline(entry, now) {
  const active = {
    $and: [windowIsActive(now), { $not: [restrictionIsExpired(now)] }],
  };
  return [
    {
      $set: {
        scope: entry.scope,
        windowStartedAt: { $cond: [active, '$windowStartedAt', now] },
        failCount: { $cond: [active, { $ifNull: ['$failCount', 0] }, 0] },
        pendingCount: { $cond: [active, { $ifNull: ['$pendingCount', 0] }, 0] },
        lockedUntil: {
          $cond: [
            { $gt: [{ $ifNull: ['$lockedUntil', EPOCH] }, now] },
            '$lockedUntil',
            null,
          ],
        },
      },
    },
    {
      $set: {
        pendingCount: { $add: ['$pendingCount', 1] },
        expiresAt: {
          $max: [
            { $add: ['$windowStartedAt', env.authFailWindowMs] },
            { $ifNull: ['$lockedUntil', EPOCH] },
          ],
        },
      },
    },
  ];
}

async function reserveCounter(entry, now) {
  await ensureCounter(entry, now);
  const { maxAttempts } = limitsFor(entry.scope);
  const filter = reservationFilter(entry, now, maxAttempts);
  const pipeline = reservationPipeline(entry, now);
  return AuthFailureCounter.findOneAndUpdate(filter, pipeline, {
    updatePipeline: true,
    returnDocument: 'after',
  });
}

async function ensureCounter(entry, now) {
  try {
    await AuthFailureCounter.updateOne(
      { key: entry.key },
      {
        $setOnInsert: {
          scope: entry.scope,
          failCount: 0,
          pendingCount: 0,
          windowStartedAt: now,
          lockedUntil: null,
          expiresAt: new Date(now.getTime() + env.authFailWindowMs),
        },
      },
      { upsert: true }
    );
  } catch (err) {
    if (err.code !== 11000) {
      throw err;
    }
  }
}

async function reserveAttempt(keys) {
  const reserved = [];
  const now = new Date();
  for (const entry of keys) {
    const counter = await reserveCounter(entry, now);
    if (!counter) {
      await completeAttempt(reserved);
      await throwRestriction(keys, now);
    }
    reserved.push(entry);
  }
  return reserved;
}

async function throwRestriction(keys, now) {
  const keyList = keys.map((entry) => entry.key);
  const locked = await AuthFailureCounter.find({
    key: { $in: keyList },
    lockedUntil: { $gt: now },
  }).select('lockedUntil scope');
  const lockWaits = locked.map((counter) =>
    retryAfterSeconds(counter.lockedUntil, now.getTime())
  );
  const fallbackWaits = keys.map((entry) => limitsFor(entry.scope).lockMs / 1000);
  const retryAfter = Math.ceil(Math.max(0, ...lockWaits, ...fallbackWaits));
  throw new ApiError(429, 'Too many failed sign-in attempts. Try again later.', {
    retryAfterSeconds: retryAfter,
  });
}

function completionPipeline(entry, now, { failed, clearFailures }) {
  const active = windowIsActive(now);
  const { maxAttempts, lockMs } = limitsFor(entry.scope);
  return [
    {
      $set: {
        scope: entry.scope,
        windowStartedAt: { $cond: [active, '$windowStartedAt', now] },
        failCount: {
          $cond: [
            active,
            { $ifNull: ['$failCount', 0] },
            0,
          ],
        },
        pendingCount: {
          $max: [
            0,
            {
              $subtract: [
                { $cond: [active, { $ifNull: ['$pendingCount', 0] }, 0] },
                1,
              ],
            },
          ],
        },
        lockedUntil: {
          $cond: [
            { $gt: [{ $ifNull: ['$lockedUntil', EPOCH] }, now] },
            '$lockedUntil',
            null,
          ],
        },
      },
    },
    {
      $set: {
        failCount: clearFailures
          ? 0
          : { $add: ['$failCount', failed ? 1 : 0] },
      },
    },
    {
      $set: {
        lockedUntil: clearFailures
          ? null
          : {
              $cond: [
                { $gte: [{ $add: ['$failCount', '$pendingCount'] }, maxAttempts] },
                {
                  $cond: [
                    { $gt: [{ $ifNull: ['$lockedUntil', EPOCH] }, now] },
                    '$lockedUntil',
                    new Date(now.getTime() + lockMs),
                  ],
                },
                '$lockedUntil',
              ],
            },
      },
    },
    {
      $set: {
        expiresAt: {
          $max: [
            { $add: ['$windowStartedAt', env.authFailWindowMs] },
            { $ifNull: ['$lockedUntil', EPOCH] },
          ],
        },
      },
    },
  ];
}

async function completeCounter(entry, options, now) {
  await ensureCounter(entry, now);
  const pipeline = completionPipeline(entry, now, options);
  await AuthFailureCounter.findOneAndUpdate(
    { key: entry.key },
    pipeline,
    { updatePipeline: true, returnDocument: 'after' }
  );
}

async function completeAttempt(keys, { failed = false, accountKey = null } = {}) {
  const now = new Date();
  for (const entry of keys) {
    await completeCounter(
      entry,
      { failed, clearFailures: !failed && entry.key === accountKey },
      now
    );
  }
}

module.exports = {
  retryAfterSeconds,
  reserveAttempt,
  completeAttempt,
};
