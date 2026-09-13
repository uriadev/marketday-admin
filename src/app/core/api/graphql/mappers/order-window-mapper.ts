import { VendorOrderWindowQuery } from '../generated';

/**
 * When one stall takes orders at one market, as `vendorOrderWindow` answers it
 * (`../backend/specs/per-market-order-windows.md`). Ties the reads below to the
 * schema via codegen, the way every other mapper does.
 */
export type GqlOrderWindow = VendorOrderWindowQuery['vendorOrderWindow'];

/**
 * The zone market days are traded in. The backend returns real instants, so
 * this is only about how they read: "pre-orders open Fri 09:00" means 09:00 at
 * the market, whatever zone the admin's laptop is set to. Mirrors the
 * backend's own `MARKET_TIME_ZONE` — one constant there, one here, until
 * `markets` grows a `timeZone` column.
 */
const MARKET_TIME_ZONE = 'Europe/Dublin';

const MOMENT = new Intl.DateTimeFormat('en-IE', {
  timeZone: MARKET_TIME_ZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function parts(timestamp: string): Record<string, string> | null {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return Object.fromEntries(MOMENT.formatToParts(date).map((part) => [part.type, part.value]));
}

/** "Sat 22 Aug" — the market day an instant falls on, in the market's zone. */
export function marketDayLabel(timestamp: string): string {
  const p = parts(timestamp);
  return p ? `${p['weekday']} ${p['day']} ${p['month']}` : '';
}

/** "Sat 22 Aug, 17:00" — an instant as the market's clock reads it. */
export function marketMomentLabel(timestamp: string): string {
  const p = parts(timestamp);
  return p ? `${p['weekday']} ${p['day']} ${p['month']}, ${p['hour']}:${p['minute']}` : '';
}

/**
 * Whether the vendor has stopped taking orders here by hand, right now.
 *
 * Read from `pausedUntil` rather than `state === PAUSED`, because the backend
 * ranks the automatic window above the pause: a stall paused two days before
 * market day reads `NOT_YET_OPEN`, which is the right answer for a shopper and
 * the wrong one for an admin asking "has this stall stopped?". A pause whose
 * instant has passed has cleared itself — the column is not swept.
 */
export function isPausedAt(window: Pick<GqlOrderWindow, 'pausedUntil'>, now: Date): boolean {
  if (!window.pausedUntil) return false;
  const until = new Date(window.pausedUntil).getTime();
  return !Number.isNaN(until) && until > now.getTime();
}
