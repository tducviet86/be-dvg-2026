/** Đà Nẵng's offset from UTC (no daylight saving). */
const OFFSET = 7 * 3_600_000;
export const DAY_MS = 86_400_000;

/**
 * The calendar day in Vietnam of an instant, as a date column stores it
 * (midnight UTC of that date): a view at 20:00 in Đà Nẵng counts that day.
 */
export const vnDay = (at: Date = new Date()) => new Date(new Date(at.getTime() + OFFSET).toISOString().slice(0, 10));

/** The instant a Vietnamese day (as `vnDay` gives it) starts. */
export const vnDayStart = (day: Date) => new Date(day.getTime() - OFFSET);
