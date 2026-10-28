'use strict';

const { z } = require('zod');
const { TRIP_STATUSES } = require('../../constants/enums');

const UTC_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/;

function parseUtcInstant(instant) {
  if (typeof instant !== 'string') return null;
  const match = UTC_INSTANT.exec(instant);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const millis = Number((match[7] || '000').padEnd(3, '0'));
  const date = new Date(Date.UTC(2000, month - 1, day, hour, minute, second, millis));
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCFullYear(year);
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() + 1 !== month
    || date.getUTCDate() !== day
    || date.getUTCHours() !== hour
    || date.getUTCMinutes() !== minute
    || date.getUTCSeconds() !== second
    || date.getUTCMilliseconds() !== millis
  ) {
    return null;
  }
  return date;
}

const decimalPage = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(
  z.number().int().min(1).max(100000)
);
const decimalLimit = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(
  z.number().int().min(1).max(50)
);
const utcInstant = z.string().transform((instant, ctx) => {
  const parsed = parseUtcInstant(instant);
  if (!parsed) {
    ctx.addIssue({ code: 'custom', message: 'Must be a valid UTC ISO instant YYYY-MM-DDTHH:mm:ss[.SSS]Z' });
    return z.NEVER;
  }
  return parsed;
});

const activityQuerySchema = z.object({
  page: decimalPage.optional().default(1),
  limit: decimalLimit.optional().default(20),
  status: z.enum(TRIP_STATUSES).optional(),
  start: utcInstant.optional(),
  end: utcInstant.optional(),
}).strict().superRefine((query, ctx) => {
  if (query.start && query.end && query.start.getTime() >= query.end.getTime()) {
    ctx.addIssue({
      code: 'custom',
      path: ['start'],
      message: 'start must be earlier than end',
    });
  }
});

module.exports = {
  activityQuerySchema,
  parseUtcInstant,
};
