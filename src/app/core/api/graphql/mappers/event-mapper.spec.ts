import { EventDraft } from '../../../models/event.model';
import { EventCategory, EventStatus, EventVenueKind, MarketStatus } from '../generated';
import {
  GqlEvent,
  toCreateEventInput,
  toEventMarketOption,
  toEventRecord,
  toUpdateEventInput,
} from './event-mapper';

/** An `EventModel` shaped like the `EventFields` fragment selects it. */
function event(overrides: Partial<GqlEvent> = {}): GqlEvent {
  return {
    id: 'ev-1',
    venueKind: EventVenueKind.Market,
    market: { id: 'mk-1', slug: 'douglas', name: 'Douglas Market' },
    vendor: null,
    areaName: 'Douglas, Co. Cork',
    address: null,
    latitude: 51.88,
    longitude: -8.44,
    title: 'The Whileaways live',
    description: null,
    category: EventCategory.Music,
    imageUrl: null,
    externalUrl: null,
    isFeatured: true,
    status: EventStatus.Published,
    startsAt: '2026-09-19T10:00:00.000Z',
    endsAt: '2026-09-19T14:00:00.000Z',
    sessions: [
      { id: 's1', startsAt: '2026-09-19T10:00:00.000Z', endsAt: '2026-09-19T11:00:00.000Z', label: 'Set 1' },
      { id: 's2', startsAt: '2026-09-19T13:00:00.000Z', endsAt: '2026-09-19T14:00:00.000Z', label: null },
    ],
    ...overrides,
  };
}

function draft(overrides: Partial<EventDraft> = {}): EventDraft {
  return {
    title: 'The Whileaways live',
    description: '',
    category: 'music',
    imageUrl: null,
    externalUrl: '',
    status: 'draft',
    isFeatured: false,
    venueKind: 'market',
    marketId: 'mk-1',
    vendorId: null,
    areaName: '',
    address: '',
    latitude: 51.8812,
    longitude: -8.4421,
    sessions: [
      {
        startsAt: new Date('2026-09-19T10:00:00.000Z'),
        endsAt: new Date('2026-09-19T11:00:00.000Z'),
        label: 'Set 1',
      },
      {
        startsAt: new Date('2026-09-19T13:00:00.000Z'),
        endsAt: new Date('2026-09-19T14:00:00.000Z'),
        label: '',
      },
    ],
    ...overrides,
  };
}

describe('event mapper', () => {
  it('reads an event, its venue link and its timing', () => {
    const record = toEventRecord(event(), new Date('2026-09-19T12:00:00.000Z'));
    expect(record.venue).toEqual({
      kind: 'market',
      marketId: 'mk-1',
      vendorId: null,
      name: 'Douglas Market',
      link: '/markets/douglas',
    });
    expect(record.category).toBe('music');
    expect(record.status).toBe('published');
    // Between the 11:00 and 14:00 sets: still on.
    expect(record.timing).toBe('ongoing');
    expect(record.sessions).toHaveLength(2);
  });

  it('reads an unknown category as "other", so the enum can grow server-first', () => {
    const record = toEventRecord(event({ category: 'CIRCUS' as EventCategory }));
    expect(record.category).toBe('other');
  });

  describe('create', () => {
    it('leaves a market event’s coordinates out entirely — not null', () => {
      const input = toCreateEventInput(draft());
      expect('latitude' in input).toBe(false);
      expect('longitude' in input).toBe(false);
      expect(input.marketId).toBe('mk-1');
      expect(input.vendorId).toBeNull();
    });

    it('sends a place event’s point and drops the market', () => {
      const input = toCreateEventInput(
        draft({ venueKind: 'place', marketId: 'mk-1', areaName: 'Ballincollig, Co. Cork' }),
      );
      expect(input.latitude).toBe(51.8812);
      expect(input.longitude).toBe(-8.4421);
      expect(input.marketId).toBeNull();
      expect(input.areaName).toBe('Ballincollig, Co. Cork');
    });

    it('sends every session, with an empty label as null', () => {
      const input = toCreateEventInput(draft());
      expect(input.sessions).toEqual([
        { startsAt: '2026-09-19T10:00:00.000Z', endsAt: '2026-09-19T11:00:00.000Z', label: 'Set 1' },
        { startsAt: '2026-09-19T13:00:00.000Z', endsAt: '2026-09-19T14:00:00.000Z', label: null },
      ]);
    });

    it('sends empty optional fields as explicit null', () => {
      const input = toCreateEventInput(draft());
      expect(input.description).toBeNull();
      expect(input.externalUrl).toBeNull();
      expect(input.address).toBeNull();
      expect(input.areaName).toBeNull();
    });
  });

  describe('update', () => {
    it('never sends the venue, and never sends areaName as null', () => {
      const input = toUpdateEventInput(draft({ areaName: '  ' }));
      expect(input).not.toHaveProperty('venueKind');
      expect(input).not.toHaveProperty('marketId');
      expect(input).not.toHaveProperty('areaName');
      expect('latitude' in input).toBe(false);
    });

    it('sends the sessions whole', () => {
      expect(toUpdateEventInput(draft()).sessions).toHaveLength(2);
    });
  });

  it('reads occurrence numerals as Irish wall-clock time', () => {
    const option = toEventMarketOption({
      id: 'mk-1',
      name: 'Douglas Market',
      city: 'Douglas',
      status: MarketStatus.Draft,
      occurrences: [{ occursOn: '2026-09-19T09:30:00.000Z', endsOn: '2026-09-19T14:00:00.000Z' }],
    });
    expect(option.isDraft).toBe(true);
    // 09:30 at the market in summer time is 08:30Z.
    expect(option.days[0]!.startsAt.toISOString()).toBe('2026-09-19T08:30:00.000Z');
    expect(option.days[0]!.endsAt.toISOString()).toBe('2026-09-19T13:00:00.000Z');
  });
});
