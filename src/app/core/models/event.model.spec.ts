import { EventSession, eventTiming, sessionsOffMarketDays } from './event.model';

const at = (iso: string) => new Date(iso);
const session = (startsAt: string, endsAt: string): EventSession => ({
  startsAt: at(startsAt),
  endsAt: at(endsAt),
  label: null,
});

describe('event model', () => {
  it('derives timing from the bounds, ending exactly at now as ended', () => {
    const now = at('2026-09-19T12:00:00.000Z');
    expect(eventTiming(at('2026-09-20T10:00:00Z'), at('2026-09-20T11:00:00Z'), now)).toBe('upcoming');
    expect(eventTiming(at('2026-09-19T10:00:00Z'), at('2026-09-19T14:00:00Z'), now)).toBe('ongoing');
    expect(eventTiming(at('2026-09-19T10:00:00Z'), now, now)).toBe('ended');
  });

  describe('sessions off market days', () => {
    const days = [
      { startsAt: at('2026-09-19T08:30:00Z'), endsAt: at('2026-09-19T13:00:00Z') },
      { startsAt: at('2026-09-26T08:30:00Z'), endsAt: at('2026-09-26T13:00:00Z') },
    ];

    it('flags a session on a day the market does not trade', () => {
      const wednesday = session('2026-09-23T10:00:00Z', '2026-09-23T12:00:00Z');
      expect(sessionsOffMarketDays([wednesday], days)).toEqual([wednesday]);
    });

    it('passes a session that overlaps a market day', () => {
      const set = session('2026-09-19T10:00:00Z', '2026-09-19T11:00:00Z');
      expect(sessionsOffMarketDays([set], days)).toEqual([]);
    });

    it('does not judge a session beyond the days it was given', () => {
      const later = session('2026-11-07T10:00:00Z', '2026-11-07T11:00:00Z');
      expect(sessionsOffMarketDays([later], days)).toEqual([]);
      expect(sessionsOffMarketDays([later], [])).toEqual([]);
    });
  });
});
