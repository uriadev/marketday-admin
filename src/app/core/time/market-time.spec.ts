import {
  fromMarketWallClock,
  fromPickers,
  marketRange,
  toMarketWallClock,
  toPickers,
} from './market-time';

describe('market time', () => {
  it('reads Irish Summer Time an hour ahead of UTC', () => {
    const instant = fromMarketWallClock({ year: 2026, month: 9, day: 19, hour: 11, minute: 0 });
    expect(instant.toISOString()).toBe('2026-09-19T10:00:00.000Z');
  });

  it('reads winter time as UTC', () => {
    const instant = fromMarketWallClock({ year: 2026, month: 12, day: 12, hour: 11, minute: 0 });
    expect(instant.toISOString()).toBe('2026-12-12T11:00:00.000Z');
  });

  it('round-trips through the wall clock on both sides of a clock change', () => {
    for (const iso of ['2026-03-29T00:30:00.000Z', '2026-10-25T02:30:00.000Z']) {
      const instant = new Date(iso);
      expect(fromMarketWallClock(toMarketWallClock(instant)).toISOString()).toBe(iso);
    }
  });

  it('takes the pickers’ local fields as market numerals', () => {
    const date = new Date(2026, 8, 19);
    const time = new Date(2000, 0, 1, 14, 30);
    expect(fromPickers(date, time).toISOString()).toBe('2026-09-19T13:30:00.000Z');
  });

  it('seeds the pickers with what the market clock read', () => {
    const { date, time } = toPickers(new Date('2026-09-19T13:30:00.000Z'));
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 8, 19]);
    expect([time.getHours(), time.getMinutes()]).toEqual([14, 30]);
  });

  it('collapses a same-day range to one date', () => {
    expect(
      marketRange(new Date('2026-09-19T10:00:00.000Z'), new Date('2026-09-19T14:00:00.000Z')),
    ).toBe('Sat 19 Sept 2026, 11:00–15:00');
  });
});
