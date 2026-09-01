import {
  MARKETS_FIXTURE,
  MARKET_SCHEDULES,
  MARKET_SETTINGS,
  SCHEDULE_SEEDS,
  STALL_FEE,
} from './market-fixture';
import { composeSchedule, durationMinutes } from '../../scheduling/recurrence';

/**
 * The trading patterns are written out as RFC 5545 text rather than composed,
 * so that `rrule` stays out of the eager bundle — see the note in
 * `market-fixture.ts`. This is what keeps that safe: every stored rule is
 * composed here from its seed and compared, so a hand-edited string that
 * `core/scheduling` would never have written fails the build.
 */
describe('MARKET_SCHEDULES', () => {
  /** Local midnight on a `YYYY-MM-DD` — the calendar date `composeSchedule` reads. */
  function calendarDate(iso: string): Date {
    const [year, month, day] = iso.split('-').map(Number);
    return new Date(year!, month! - 1, day!);
  }

  it('stores a rule for every market in the directory', () => {
    expect(Object.keys(MARKET_SCHEDULES).sort()).toEqual(
      MARKETS_FIXTURE.map((market) => market.slug).sort(),
    );
  });

  it.each(Object.keys(SCHEDULE_SEEDS))('composes %s’s rule from its seed', (slug) => {
    const seed = SCHEDULE_SEEDS[slug]!;
    const stored = MARKET_SCHEDULES[slug]!;

    expect(stored.schedule).toBe(
      composeSchedule({
        frequency: 'WEEKLY',
        tradingDays: seed.tradingDays,
        startsOn: calendarDate(seed.startsOn),
        opensAt: seed.opensAt,
        ends: { kind: 'NEVER' },
      }),
    );
    expect(stored.duration).toBe(durationMinutes(seed.opensAt, seed.closesAt));
    expect(stored.tradingDays).toEqual([...seed.tradingDays]);
    expect(stored.opensAt).toBe(seed.opensAt);
    expect(stored.closesAt).toBe(seed.closesAt);
  });

  it.each(MARKETS_FIXTURE)('agrees with $slug’s own “when” line', (market) => {
    const stored = MARKET_SCHEDULES[market.slug]!;
    // The card says "Dublin 2 · Saturdays 09:00–14:30"; the tab must not
    // disagree with it about the hours it trades.
    expect(market.when).toContain(`${stored.opensAt}–${stored.closesAt}`);
    expect(market.days.length).toBe(stored.tradingDays.length);
  });
});

/**
 * The Settings tab and the directory card draw on the same market. These are
 * the fields both of them show, which are the ones that can contradict.
 */
describe('MARKET_SETTINGS', () => {
  it('covers every market in the directory', () => {
    expect(Object.keys(MARKET_SETTINGS).sort()).toEqual(
      MARKETS_FIXTURE.map((market) => market.slug).sort(),
    );
  });

  it.each(MARKETS_FIXTURE)('agrees with $slug’s own row', (market) => {
    const settings = MARKET_SETTINGS[market.slug]!;

    expect(settings.name).toBe(market.name);
    expect(settings.slug).toBe(market.slug);
    expect(settings.county).toBe(market.county);
    expect(settings.stallFeePerDay).toBe(STALL_FEE);
  });

  it.each(MARKETS_FIXTURE)('puts $slug on the map', (market) => {
    const { latitude, longitude } = MARKET_SETTINGS[market.slug]!;

    // Somewhere on the island of Ireland, not at (0, 0) off West Africa —
    // `CreateMarketInput` requires the point, so a missing one has to be visible.
    expect(latitude).toBeGreaterThan(51);
    expect(latitude).toBeLessThan(56);
    expect(longitude).toBeGreaterThan(-11);
    expect(longitude).toBeLessThan(-5);
  });
});
