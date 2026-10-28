'use strict';

const { z } = require('zod');
const { EARNING_STATUSES } = require('../../constants/enums');

const MONTH = /^([0-9]{4})-(0[1-9]|1[0-2])$/;
const PAGE = /^[1-9][0-9]*$/;

function utcDate(year, monthIndex, day = 1) {
  const date = new Date(Date.UTC(2000, monthIndex, day, 0, 0, 0, 0));
  date.setUTCFullYear(year);
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== monthIndex
    || date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function parseMonth(monthText) {
  if (typeof monthText !== 'string') return null;
  const match = MONTH.exec(monthText);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < 1 || year > 9999) return null;
  const start = utcDate(year, month - 1, 1);
  if (!start) return null;
  const end = month === 12 ? utcDate(year + 1, 0, 1) : utcDate(year, month, 1);
  if (!end) return null;
  return {
    month: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`,
    start,
    end,
  };
}

const decimalPage = z.string().regex(PAGE).transform(Number).pipe(
  z.number().int().min(1).max(100000)
);
const decimalLimit = z.string().regex(PAGE).transform(Number).pipe(
  z.number().int().min(1).max(50)
);

const earningsQuerySchema = z.object({
  month: z.string().transform((monthText, ctx) => {
    const parsed = parseMonth(monthText);
    if (!parsed) {
      ctx.addIssue({ code: 'custom', message: 'month must be an ASCII YYYY-MM UTC calendar month' });
      return z.NEVER;
    }
    return parsed;
  }),
  status: z.enum(EARNING_STATUSES).optional(),
  page: decimalPage.optional().default(1),
  limit: decimalLimit.optional().default(20),
}).strict();

module.exports = {
  earningsQuerySchema,
  parseMonth,
};
