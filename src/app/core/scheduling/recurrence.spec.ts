import {
  Recurrence,
  composeSchedule,
  describeSchedule,
  durationMinutes,
  formatTimeOfDay,
  expandSchedule,
  nextOccurrence,
  parseTimeOfDay,
} from './recurrence';

/** Saturday 5 September 2026 — the first Saturday of that month. */
const SATURDAY = new Date(2026, 8, 5);

function recurrence(overrides: Partial<Recurrence> = {}): Recurrence {
  return {
    frequency: 'WEEKLY',
    tradingDays: [6],
    startsOn: SATURDAY,
    opensAt: '09:00',
    ends: { kind: 'NEVER' },
    ...overrides,
  };
}

describe('composeSchedule', () => {
  it('writes a weekly rule from a single trading day', () => {
    expect(composeSchedule(recurrence())).toBe(
      'DTSTART:20260905T090000Z\nRRULE:FREQ=WEEKLY;BYDAY=SA',
    );
  });

  it('writes a fortnightly rule as a weekly rule with an interval', () => {
    const schedule = composeSchedule(recurrence({ frequency: 'FORTNIGHTLY', tradingDays: [7, 6] }));
    expect(schedule).toBe('DTSTART:20260905T090000Z\nRRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=SA,SU');
  });

  it('infers the monthly position from the start date', () => {
    expect(composeSchedule(recurrence({ frequency: 'MONTHLY' }))).toContain('BYDAY=+1SA');
    expect(
      composeSchedule(recurrence({ frequency: 'MONTHLY', startsOn: new Date(2026, 8, 12) })),
    ).toContain('BYDAY=+2SA');
  });

  it('ends on a date as UNTIL, at the end of that day', () => {
    expect(
      composeSchedule(recurrence({ ends: { kind: 'ON', date: new Date(2026, 11, 31) } })),
    ).toBe('DTSTART:20260905T090000Z\nRRULE:FREQ=WEEKLY;BYDAY=SA;UNTIL=20261231T235959Z');
  });

  it('ends after a number of markets as COUNT', () => {
    expect(composeSchedule(recurrence({ ends: { kind: 'AFTER', count: 10 } }))).toBe(
      'DTSTART:20260905T090000Z\nRRULE:FREQ=WEEKLY;BYDAY=SA;COUNT=10',
    );
  });

  it('uses the opening time as the start time', () => {
    expect(composeSchedule(recurrence({ opensAt: '07:30' }))).toContain('DTSTART:20260905T073000Z');
  });

  it('yields nothing while the recurrence is incomplete', () => {
    expect(composeSchedule(recurrence({ tradingDays: [] }))).toBe('');
    expect(composeSchedule(recurrence({ startsOn: null as unknown as Date }))).toBe('');
    expect(composeSchedule(recurrence({ opensAt: '' }))).toBe('');
  });
});

describe('expandSchedule', () => {
  it('round-trips every recurrence the four controls can express, with no gaps', () => {
    const cases: Recurrence[] = [
      recurrence(),
      recurrence({ frequency: 'FORTNIGHTLY', tradingDays: [6, 7] }),
      recurrence({ frequency: 'MONTHLY' }),
      recurrence({ ends: { kind: 'ON', date: new Date(2026, 11, 31) } }),
      recurrence({ ends: { kind: 'AFTER', count: 10 } }),
      recurrence({ tradingDays: [2, 5], opensAt: '10:15' }),
    ];
    for (const original of cases) {
      expect(expandSchedule(composeSchedule(original))).toEqual({
        recurrence: original,
        gaps: [],
      });
    }
  });

  it('reads a weekly rule with no BYDAY off its start date, exactly', () => {
    // RFC 5545 §3.3.10: a weekly rule without BYDAY falls on DTSTART's weekday.
    expect(expandSchedule('DTSTART:20260905T090000Z\nRRULE:FREQ=WEEKLY')).toEqual({
      recurrence: recurrence(),
      gaps: [],
    });
  });

  it('starts a rule that carries no start from today, as the API already does', () => {
    const expanded = expandSchedule('RRULE:FREQ=WEEKLY;BYDAY=SA');
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);

    expect(expanded?.recurrence.frequency).toBe('WEEKLY');
    expect(expanded?.recurrence.tradingDays).toEqual([6]);
    // `rrule` defaults DTSTART to now, so this is what the stored rule already
    // means to the backend rather than a date the console picked.
    expect(expanded?.recurrence.startsOn).toEqual(midnight);
    // DTSTART is the only place an opening time lives — none is invented.
    expect(expanded?.recurrence.opensAt).toBe('');
    expect(expanded?.gaps).toEqual(['startsOn', 'opensAt']);
  });

  it('reads the trading day off today when neither DTSTART nor BYDAY says', () => {
    const expanded = expandSchedule('RRULE:FREQ=WEEKLY');
    const isoToday = ((new Date().getDay() + 6) % 7) + 1;

    expect(expanded?.recurrence.tradingDays).toEqual([isoToday]);
    expect(expanded?.gaps).toEqual(['startsOn', 'opensAt']);
  });

  it('falls back to the nearest frequency the select can hold, and says so', () => {
    const daily = expandSchedule('DTSTART:20260905T090000Z\nRRULE:FREQ=DAILY');

    expect(daily?.recurrence.frequency).toBe('WEEKLY');
    expect(daily?.recurrence.tradingDays).toEqual([6]);
    expect(daily?.gaps).toEqual(['frequency']);

    expect(
      expandSchedule('DTSTART:20260905T090000Z\nRRULE:FREQ=WEEKLY;INTERVAL=3;BYDAY=SA')?.gaps,
    ).toEqual(['frequency']);
  });

  it('flags a rule that repeats by date rather than by weekday', () => {
    const expanded = expandSchedule('DTSTART:20260905T090000Z\nRRULE:FREQ=MONTHLY;BYMONTHDAY=15');

    expect(expanded?.recurrence.frequency).toBe('MONTHLY');
    expect(expanded?.gaps).toEqual(['tradingDays', 'restrictions']);
  });

  it('flags a monthly position the editor would rewrite on save', () => {
    // Composing re-derives the position from the start date, so "the last
    // Saturday" and a bare "every Saturday" both come back as "the 1st".
    expect(expandSchedule('DTSTART:20260905T090000Z\nRRULE:FREQ=MONTHLY;BYDAY=-1SA')?.gaps).toEqual(
      ['restrictions'],
    );
    expect(expandSchedule('DTSTART:20260905T090000Z\nRRULE:FREQ=MONTHLY;BYDAY=SA')?.gaps).toEqual([
      'restrictions',
    ]);
  });

  it('is null only when there is no readable rule at all', () => {
    expect(expandSchedule('')).toBeNull();
    expect(expandSchedule('not a rule')).toBeNull();
  });
});

describe('describeSchedule', () => {
  it('describes the rule as a sentence', () => {
    expect(describeSchedule(composeSchedule(recurrence()))).toBe('Every week on Saturday');
    expect(describeSchedule(composeSchedule(recurrence({ frequency: 'MONTHLY' })))).toBe(
      'Every month on the 1st Saturday',
    );
  });

  it('is empty when there is no rule yet', () => {
    expect(describeSchedule('')).toBe('');
  });
});

describe('nextOccurrence', () => {
  it('includes the start date when it is itself a market day', () => {
    const next = nextOccurrence(composeSchedule(recurrence()), new Date(Date.UTC(2026, 8, 1)));
    expect(next?.toISOString()).toBe('2026-09-05T09:00:00.000Z');
  });

  it('skips ahead when the start date is not a trading day', () => {
    const schedule = composeSchedule(recurrence({ startsOn: new Date(2026, 8, 2) }));
    const next = nextOccurrence(schedule, new Date(Date.UTC(2026, 8, 2)));
    expect(next?.toISOString()).toBe('2026-09-05T09:00:00.000Z');
  });

  it('runs out once the rule ends', () => {
    const schedule = composeSchedule(recurrence({ ends: { kind: 'AFTER', count: 1 } }));
    expect(nextOccurrence(schedule, new Date(Date.UTC(2026, 8, 6)))).toBeNull();
  });

  it('is null without a rule', () => {
    expect(nextOccurrence('')).toBeNull();
  });
});

describe('durationMinutes', () => {
  it('measures the trading window', () => {
    expect(durationMinutes('09:00', '14:30')).toBe(330);
  });

  it('is zero when the times match, and negative when they are reversed', () => {
    expect(durationMinutes('09:00', '09:00')).toBe(0);
    expect(durationMinutes('15:00', '09:00')).toBe(-360);
  });

  it('is zero when either time is unreadable', () => {
    expect(durationMinutes('', '15:00')).toBe(0);
    expect(durationMinutes('09:00', '25:00')).toBe(0);
  });
});

describe('time of day', () => {
  it('reads the wall clock off a picked date, ignoring its date part', () => {
    expect(formatTimeOfDay(new Date(2026, 8, 5, 9, 5))).toBe('09:05');
    expect(formatTimeOfDay(new Date(1999, 0, 1, 14, 30))).toBe('14:30');
  });

  it('is empty without a usable date', () => {
    expect(formatTimeOfDay(null)).toBe('');
    expect(formatTimeOfDay(new Date(NaN))).toBe('');
  });

  it('round-trips a stored time back into a date a timepicker can hold', () => {
    const picked = parseTimeOfDay('09:00', SATURDAY);
    expect(picked?.getHours()).toBe(9);
    expect(picked?.getMinutes()).toBe(0);
    expect(formatTimeOfDay(picked)).toBe('09:00');
  });

  it('is null when the stored time is unreadable', () => {
    expect(parseTimeOfDay('')).toBeNull();
    expect(parseTimeOfDay('25:00')).toBeNull();
  });
});
