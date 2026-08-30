import { RRule, Weekday } from 'rrule';

/**
 * A market's trading pattern, in the terms the wizard's four controls speak,
 * and the RFC 5545 string the backend stores in `markets.schedule`.
 *
 * `rrule` is imported here and nowhere else in the app: every other layer deals
 * in `Recurrence` values and opaque schedule strings, so replacing the library
 * is a one-file change.
 *
 * ## Time zones
 *
 * Every instant in the emitted string is UTC (`DTSTART:20260905T090000Z`), built
 * from the *calendar* fields of `startsOn` and the wall-clock `opensAt`. An
 * organiser in Dublin and a server in UTC therefore compose the same string from
 * the same form, which is the property that matters — the alternative, a local
 * instant, would silently shift a 09:00 market by an hour each summer.
 */
export type RecurrenceFrequency = 'WEEKLY' | 'FORTNIGHTLY' | 'MONTHLY';

/** How the rule stops: never, on a date (`UNTIL`), or after N markets (`COUNT`). */
export type RecurrenceEnd =
  | { readonly kind: 'NEVER' }
  | { readonly kind: 'ON'; readonly date: Date }
  | { readonly kind: 'AFTER'; readonly count: number };

export interface Recurrence {
  readonly frequency: RecurrenceFrequency;
  /** ISO weekdays, 1 = Monday … 7 = Sunday. Empty means "not chosen yet". */
  readonly tradingDays: readonly number[];
  /** Only the calendar date is read; the time comes from `opensAt`. */
  readonly startsOn: Date;
  /** Wall-clock opening time, `'HH:mm'`. */
  readonly opensAt: string;
  readonly ends: RecurrenceEnd;
}

/** ISO weekday (1 = Monday) → the `rrule` weekday, which counts Monday as 0. */
const WEEKDAYS: readonly Weekday[] = [
  RRule.MO,
  RRule.TU,
  RRule.WE,
  RRule.TH,
  RRule.FR,
  RRule.SA,
  RRule.SU,
];

const TIME_PATTERN = /^(\d{1,2}):(\d{2})$/;

/**
 * Builds the `DTSTART:…\nRRULE:…` text for a recurrence.
 *
 * Returns `''` while the recurrence is incomplete — no trading days, no start
 * date, an unreadable opening time — so a half-filled form yields an empty
 * schedule rather than a rule the backend would reject.
 */
export function composeSchedule(recurrence: Recurrence): string {
  const { frequency, tradingDays, startsOn, opensAt, ends } = recurrence;
  const days = normaliseDays(tradingDays);
  const time = parseTime(opensAt);
  if (!days.length || !isValidDate(startsOn) || !time) return '';

  const dtstart = utcInstant(startsOn, time);
  const monthly = frequency === 'MONTHLY';
  // Monthly needs a position in the month; it is inferred from the start date
  // ("starts Sat 5 Sep" → the 1st Saturday) rather than asked for separately.
  const nth = monthly ? weekdayOrdinal(startsOn) : 0;

  const rule = new RRule({
    freq: monthly ? RRule.MONTHLY : RRule.WEEKLY,
    ...(frequency === 'FORTNIGHTLY' ? { interval: 2 } : {}),
    dtstart,
    byweekday: days.map((day) => (monthly ? WEEKDAYS[day - 1].nth(nth) : WEEKDAYS[day - 1])),
    ...(ends.kind === 'ON' && isValidDate(ends.date)
      ? { until: utcInstant(ends.date, { hours: 23, minutes: 59 }, 59) }
      : {}),
    ...(ends.kind === 'AFTER' && ends.count > 0 ? { count: Math.trunc(ends.count) } : {}),
  });

  return rule.toString();
}

/**
 * The inverse of {@link composeSchedule}, for seeding the form from a saved
 * market. Returns `null` for anything the four controls cannot express — a
 * daily or yearly rule, say — so the caller can fall back rather than render a
 * lie.
 */
export function parseSchedule(text: string): Recurrence | null {
  const rule = toRule(text);
  if (!rule) return null;

  const { freq, dtstart, until, count } = rule.origOptions;
  const interval = rule.origOptions.interval ?? 1;
  if (!dtstart) return null;

  let frequency: RecurrenceFrequency;
  if (freq === RRule.MONTHLY) frequency = 'MONTHLY';
  else if (freq === RRule.WEEKLY) frequency = interval >= 2 ? 'FORTNIGHTLY' : 'WEEKLY';
  else return null;

  const tradingDays = normaliseDays(
    toArray(rule.origOptions.byweekday).map((day) => isoWeekday(day)),
  );
  if (!tradingDays.length) return null;

  let ends: RecurrenceEnd = { kind: 'NEVER' };
  if (until) ends = { kind: 'ON', date: localDate(until) };
  else if (count) ends = { kind: 'AFTER', count };

  return {
    frequency,
    tradingDays,
    startsOn: localDate(dtstart),
    opensAt: `${pad(dtstart.getUTCHours())}:${pad(dtstart.getUTCMinutes())}`,
    ends,
  };
}

/**
 * Plain English for a schedule — "Every week on Saturday until December 31,
 * 2026" — so an organiser can check the rule without reading the RRULE.
 */
export function describeSchedule(text: string): string {
  const rule = toRule(text);
  if (!rule) return '';
  const sentence = rule.toText();
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/** The first market on or after `from`, or `null` once the rule has run out. */
export function nextOccurrence(text: string, from: Date = new Date()): Date | null {
  const rule = toRule(text);
  if (!rule) return null;
  try {
    return rule.after(from, true);
  } catch {
    return null;
  }
}

/**
 * Minutes a market is open, which the backend stores as `duration`. Zero when
 * either time is unreadable and negative when closing is before opening, so
 * callers can tell "not filled in yet" from "the wrong way round".
 */
export function durationMinutes(opensAt: string, closesAt: string): number {
  const opens = parseTime(opensAt);
  const closes = parseTime(closesAt);
  if (!opens || !closes) return 0;
  return closes.hours * 60 + closes.minutes - (opens.hours * 60 + opens.minutes);
}

/**
 * `'HH:mm'` for a date picked in a `mat-timepicker`, which deals in `Date`
 * while the domain — `Recurrence.opensAt`, `MarketDraft.opensAt` — deals in
 * wall-clock strings. Only the time of day is read; the date part is ignored.
 */
export function formatTimeOfDay(value: Date | null | undefined): string {
  if (!isValidDate(value)) return '';
  return `${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

/** The reverse, for seeding a timepicker from a stored `'HH:mm'`. */
export function parseTimeOfDay(value: string, on: Date = new Date()): Date | null {
  const time = parseTime(value);
  if (!time) return null;
  return new Date(on.getFullYear(), on.getMonth(), on.getDate(), time.hours, time.minutes);
}

function toRule(text: string): RRule | null {
  if (!text?.trim()) return null;
  try {
    return RRule.fromString(text);
  } catch {
    return null;
  }
}

interface Time {
  readonly hours: number;
  readonly minutes: number;
}

function parseTime(value: string): Time | null {
  const match = TIME_PATTERN.exec(value?.trim() ?? '');
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

/** The calendar date of `date` at `time`, as a UTC instant. See the note above. */
function utcInstant(date: Date, time: Time, seconds = 0): Date {
  return new Date(
    Date.UTC(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      time.hours,
      time.minutes,
      seconds,
    ),
  );
}

/** The reverse: a UTC instant back to local midnight on the same calendar day. */
function localDate(instant: Date): Date {
  return new Date(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate());
}

/** 1 for the first Saturday of the month, 2 for the second, and so on. */
function weekdayOrdinal(date: Date): number {
  return Math.floor((date.getDate() - 1) / 7) + 1;
}

function isoWeekday(day: Weekday | number | string): number {
  if (day instanceof Weekday) return day.weekday + 1;
  if (typeof day === 'number') return day + 1;
  const index = WEEKDAYS.findIndex((weekday) => weekday.toString() === day);
  return index >= 0 ? index + 1 : 0;
}

/** Sorted, de-duplicated, and stripped of anything outside Monday–Sunday. */
function normaliseDays(days: readonly number[]): number[] {
  return [...new Set(days)].filter((day) => day >= 1 && day <= 7).sort((a, b) => a - b);
}

function toArray<T>(value: T | readonly T[] | null | undefined): T[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? [...value] : [value as T];
}

function isValidDate(value: Date | null | undefined): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
