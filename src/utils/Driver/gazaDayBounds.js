'use strict';

const GAZA_TIMEZONE = 'Asia/Gaza';

function calendarDateInZone(instant, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function nextCalendarDate(ymd) {
  const [year, month, day] = ymd.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const y = String(next.getUTCFullYear()).padStart(4, '0');
  const m = String(next.getUTCMonth() + 1).padStart(2, '0');
  const d = String(next.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function firstInstantOfCalendarDate(ymd, timeZone) {
  const [year, month, day] = ymd.split('-').map(Number);
  const approx = Date.UTC(year, month - 1, day, 0, 0, 0);
  let lo = approx - 48 * 3600 * 1000;
  let hi = approx + 48 * 3600 * 1000;
  while (lo < hi) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (calendarDateInZone(new Date(mid), timeZone) < ymd) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  if (calendarDateInZone(new Date(lo), timeZone) !== ymd) {
    throw new Error(`Unable to resolve ${ymd} in ${timeZone}`);
  }
  return new Date(lo);
}

function gazaOperatingDay(now = new Date()) {
  const date = calendarDateInZone(now, GAZA_TIMEZONE);
  const startAt = firstInstantOfCalendarDate(date, GAZA_TIMEZONE);
  const endAt = firstInstantOfCalendarDate(nextCalendarDate(date), GAZA_TIMEZONE);
  return {
    date,
    timezone: GAZA_TIMEZONE,
    startAt,
    endAt,
  };
}

module.exports = {
  GAZA_TIMEZONE,
  calendarDateInZone,
  gazaOperatingDay,
};
