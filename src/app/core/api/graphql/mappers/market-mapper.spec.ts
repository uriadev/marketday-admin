import { MarketDraft, MarketType } from '../../../models/market.model';
import { MarketStatus as GqlMarketStatus, MarketType as GqlMarketType } from '../generated';
import {
  GqlMarket,
  toCreateVariables,
  toMarketDetail,
  toMarketSummary,
  toUpdateVariablesFromSettings,
} from './market-mapper';

/** A wizard payload with every optional field left empty, as a fresh form has it. */
function draft(overrides: Partial<MarketDraft> = {}): MarketDraft {
  return {
    name: 'Bantry Friday Market',
    slug: 'bantry-friday',
    marketType: null,
    description: '',
    imageUrl: null,
    bannerUrl: null,
    stallFeePerDay: null,
    reviewApplications: false,
    schedule: 'DTSTART:20260904T090000\nRRULE:FREQ=WEEKLY;BYDAY=FR',
    duration: 300,
    tradingDays: [5],
    opensAt: '09:00',
    closesAt: '14:00',
    address: 'The Square',
    city: 'Bantry',
    county: 'Cork',
    eircode: '',
    latitude: 51.68,
    longitude: -9.45,
    accessNotes: '',
    organiserName: '',
    organiserPhone: '',
    ...overrides,
  };
}

const EMPTY_OPTIONALS = {
  description: null,
  imageUrl: null,
  bannerImageUrl: null,
  marketType: null,
  organiserName: null,
  organiserPhone: null,
  stallFeePerDay: null,
};

describe('toCreateVariables', () => {
  it('sends every optional field the form left empty as an explicit null', () => {
    const { input } = toCreateVariables(draft(), false);

    // `toEqual` would let an `undefined` pass for a missing key; `toMatchObject`
    // on `null` does not.
    expect(input).toMatchObject(EMPTY_OPTIONALS);
    for (const key of Object.keys(EMPTY_OPTIONALS)) {
      expect(input).toHaveProperty(key, null);
    }
  });

  it('treats a whitespace-only field as empty', () => {
    const { input } = toCreateVariables(
      draft({ description: '  ', organiserName: ' ', organiserPhone: '   ' }),
      false,
    );

    expect(input).toMatchObject({
      description: null,
      organiserName: null,
      organiserPhone: null,
    });
  });

  it('sends the values it was given', () => {
    const { input } = toCreateVariables(
      draft({
        description: 'Fresh produce by the bay.',
        imageUrl: 'https://cdn.marketday.ie/markets/bantry.jpg',
        bannerUrl: 'https://cdn.marketday.ie/markets/bantry-banner.jpg',
        marketType: MarketType.Farmers,
        organiserName: 'Bantry Market Committee',
        organiserPhone: '+353 27 50000',
        stallFeePerDay: 0,
      }),
      true,
    );

    expect(input).toMatchObject({
      description: 'Fresh produce by the bay.',
      imageUrl: 'https://cdn.marketday.ie/markets/bantry.jpg',
      bannerImageUrl: 'https://cdn.marketday.ie/markets/bantry-banner.jpg',
      marketType: GqlMarketType.Farmers,
      organiserName: 'Bantry Market Committee',
      organiserPhone: '+353 27 50000',
      // Free is a fee of zero, not an absent one.
      stallFeePerDay: 0,
    });
  });
});

describe('toUpdateVariablesFromSettings', () => {
  // A `MarketDraft` is a superset of what the Settings tab saves, so it stands in.
  it('sends a field the admin emptied as null, so the stored value is cleared', () => {
    const { input } = toUpdateVariablesFromSettings('mkt-1', draft());

    for (const key of Object.keys(EMPTY_OPTIONALS)) {
      expect(input).toHaveProperty(key, null);
    }
  });

  it('leaves the coordinates out rather than nulling them when there is no pin', () => {
    // A market always has a location: no pin means "leave it", not "clear it".
    const { input } = toUpdateVariablesFromSettings(
      'mkt-1',
      draft({ latitude: null, longitude: null }),
    );

    expect(input.latitude).toBeUndefined();
    expect(input.longitude).toBeUndefined();
  });
});

/** Last season's Christmas market, as `adminMarkets` returns it once retired. */
function endedMarket(overrides: Partial<GqlMarket> = {}): GqlMarket {
  return {
    id: 'mkt-1',
    slug: 'dun-laoghaire-christmas',
    name: 'Dún Laoghaire Christmas Market',
    description: null,
    address: 'Harbour Plaza',
    city: 'Dún Laoghaire',
    status: GqlMarketStatus.Draft,
    marketType: null,
    schedule: 'DTSTART:20251121T120000Z\nRRULE:FREQ=DAILY;UNTIL=20251223T235959Z',
    scheduleEnded: true,
    duration: 540,
    location: null,
    tags: [],
    isActive: true,
    organiserName: null,
    organiserPhone: null,
    stallFeePerDay: null,
    reviewApplications: false,
    imageUrl: null,
    bannerImageUrl: null,
    occurrences: [],
    ...overrides,
  } as GqlMarket;
}

describe('toMarketSummary', () => {
  it('badges an ended season before it badges a draft', () => {
    const summary = toMarketSummary(endedMarket());

    expect(summary.seasonEnded).toBe(true);
    expect(summary.status).toBe('DRAFT');
    expect(summary.badgeLabel).toBe('Season ended');
  });

  it('badges a published market inside its grace period as ended too', () => {
    const summary = toMarketSummary(endedMarket({ status: GqlMarketStatus.Published }));

    expect(summary.status).toBe('PUBLISHED');
    expect(summary.badgeLabel).toBe('Season ended');
  });

  it('leaves a draft whose dates are still to come as a plain draft', () => {
    const summary = toMarketSummary(endedMarket({ scheduleEnded: false }));

    expect(summary.seasonEnded).toBe(false);
    expect(summary.badgeLabel).toBe('Draft');
  });
});

describe('toMarketDetail', () => {
  it('says when the season ended and leaves the dates item unticked', () => {
    const detail = toMarketDetail(endedMarket(), 0);

    expect(detail.seasonEndedOn).toBe('Tue 23 December 2025');
    expect(detail.meta).toContain('season ended Tue 23 December 2025');
    expect(detail.checklist.find((item) => item.id === 'dates')?.done).toBe(false);
  });

  it('has no ended date for a market still trading', () => {
    expect(toMarketDetail(endedMarket({ scheduleEnded: false }), 0).seasonEndedOn).toBeNull();
  });
});
