/**
 * The zone market days are traded in. The backend stores real instants for
 * events, promotions and order windows, so this is only about how a time reads
 * and how one typed into the console is meant: "11:00" is 11:00 at the
 * market, whatever zone the admin's laptop is set to. Mirrors the backend's
 * own `MARKET_TIME_ZONE` — one constant there, one here, until `markets` grows
 * a `timeZone` column.
 */
export const MARKET_TIME_ZONE = 'Europe/Dublin';

/** A wall-clock reading in {@link MARKET_TIME_ZONE}. `month` is 1-based. */
export interface MarketWallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const PARTS = new Intl.DateTimeFormat('en-IE', {
  timeZone: MARKET_TIME_ZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
  hourCycle: 'h23',
});

function partsOf(instant: Date): Record<string, number> {
  return Object.fromEntries(
    PARTS.formatToParts(instant)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
}

/** How far the market's clock is ahead of UTC at `instant`, in milliseconds. */
function offsetAt(instant: Date): number {
  const p = partsOf(instant);
  const asUtc = Date.UTC(p['year']!, p['month']! - 1, p['day']!, p['hour']!, p['minute']!, p['second']!);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** What the market's clock reads at `instant`. */
export function toMarketWallClock(instant: Date): MarketWallClock {
  const p = partsOf(instant);
  return {
    year: p['year']!,
    month: p['month']!,
    day: p['day']!,
    hour: p['hour']!,
    minute: p['minute']!,
  };
}

/**
 * The instant at which the market's clock reads `clock`.
 *
 * Guess with the offset at the naive UTC reading, then correct once with the
 * offset at the guess — the two differ only when a clock change falls between
 * them. A reading that does not exist (the skipped hour in March) lands an
 * hour later; one that happens twice (October) takes the first, summer-time
 * one.
 */
export function fromMarketWallClock(clock: MarketWallClock): Date {
  const naive = Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute);
  const first = naive - offsetAt(new Date(naive));
  const second = naive - offsetAt(new Date(first));
  return new Date(second);
}

/**
 * Combines what a datepicker and a timepicker hold — each a `Date` whose
 * *local* fields carry the choice — into the instant those numerals mean at
 * the market.
 */
export function fromPickers(date: Date, time: Date): Date {
  return fromMarketWallClock({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: time.getHours(),
    minute: time.getMinutes(),
  });
}

/**
 * The inverse of {@link fromPickers}: local `Date`s whose fields show what the
 * market's clock read at `instant`, ready to seed a datepicker and a
 * timepicker.
 */
export function toPickers(instant: Date): { date: Date; time: Date } {
  const c = toMarketWallClock(instant);
  return {
    date: new Date(c.year, c.month - 1, c.day),
    time: new Date(c.year, c.month - 1, c.day, c.hour, c.minute),
  };
}

const DAY = new Intl.DateTimeFormat('en-IE', {
  timeZone: MARKET_TIME_ZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const TIME = new Intl.DateTimeFormat('en-IE', {
  timeZone: MARKET_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** "Sat 19 Sept 2026" at the market. */
export function marketDate(instant: Date): string {
  return DAY.format(instant);
}

/** "11:00" at the market. */
export function marketTime(instant: Date): string {
  return TIME.format(instant);
}

function sameMarketDay(a: Date, b: Date): boolean {
  const x = toMarketWallClock(a);
  const y = toMarketWallClock(b);
  return x.year === y.year && x.month === y.month && x.day === y.day;
}

/**
 * "Sat 19 Sept 2026, 11:00–15:00", or across days
 * "Sat 19 Sept 2026, 11:00 – Sun 20 Sept 2026, 18:00".
 */
export function marketRange(startsAt: Date, endsAt: Date): string {
  if (sameMarketDay(startsAt, endsAt)) {
    return `${marketDate(startsAt)}, ${marketTime(startsAt)}–${marketTime(endsAt)}`;
  }
  return `${marketDate(startsAt)}, ${marketTime(startsAt)} – ${marketDate(endsAt)}, ${marketTime(endsAt)}`;
}
