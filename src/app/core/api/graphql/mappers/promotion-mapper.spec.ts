import { PromotionDraft } from '../../../models/promotion.model';
import {
  PromotionPlacement,
  PromotionServingState,
  PromotionStatus,
  PromotionTargetKind,
} from '../generated';
import {
  GqlPromotion,
  centroidOf,
  toCreatePromotionInput,
  toPromotionRecord,
  toUpdatePromotionInput,
} from './promotion-mapper';

function promotion(overrides: Partial<GqlPromotion> = {}): GqlPromotion {
  return {
    id: 'pr-1',
    targetKind: PromotionTargetKind.Vendor,
    event: null,
    market: null,
    vendor: { id: 'vd-1', slug: 'mcnally-farm', name: 'McNally Family Farm', imageUrl: 'v.jpg' },
    product: null,
    linkUrl: null,
    placement: PromotionPlacement.HomeFeed,
    status: PromotionStatus.Scheduled,
    servingState: PromotionServingState.SubjectHidden,
    startsAt: '2026-10-01T00:00:00.000Z',
    endsAt: '2026-10-15T00:00:00.000Z',
    priority: 0,
    headline: 'McNally Family Farm',
    body: null,
    imageUrl: 'v.jpg',
    ctaLabel: null,
    sponsorName: 'McNally Family Farm',
    sponsorVendorId: 'vd-1',
    isHouse: false,
    disclosure: 'Sponsored',
    isNationwide: false,
    reachLatitude: 51.9,
    reachLongitude: -8.47,
    reachRadiusKm: 30,
    marketIds: [],
    ...overrides,
  };
}

function draft(overrides: Partial<PromotionDraft> = {}): PromotionDraft {
  return {
    subject: { kind: 'vendor', id: 'vd-1' },
    linkUrl: '',
    placement: 'home-feed',
    status: 'draft',
    startsAt: new Date('2026-10-01T00:00:00.000Z'),
    endsAt: new Date('2026-10-15T00:00:00.000Z'),
    priority: 0,
    headline: '',
    body: '',
    imageUrl: null,
    ctaLabel: '',
    sponsorName: 'McNally Family Farm',
    sponsorVendorId: 'vd-1',
    isHouse: false,
    isNationwide: false,
    reach: { latitude: 51.9, longitude: -8.47, radiusKm: 30 },
    marketIds: [],
    ...overrides,
  };
}

describe('promotion mapper', () => {
  it('reads the serving state, the subject and the reach', () => {
    const record = toPromotionRecord(promotion());
    expect(record.servingState).toBe('subject-hidden');
    expect(record.subject).toMatchObject({
      kind: 'vendor',
      id: 'vd-1',
      name: 'McNally Family Farm',
      link: '/vendors/mcnally-farm',
    });
    expect(record.reach).toEqual({ latitude: 51.9, longitude: -8.47, radiusKm: 30 });
  });

  it('tells a creative of its own from the subject’s fallback', () => {
    const fallback = toPromotionRecord(promotion());
    expect(fallback.headline).toBeNull();
    expect(fallback.imageUrl).toBeNull();
    expect(fallback.displayHeadline).toBe('McNally Family Farm');

    const own = toPromotionRecord(promotion({ headline: 'Pumpkins are in', imageUrl: 'p.jpg' }));
    expect(own.headline).toBe('Pumpkins are in');
    expect(own.imageUrl).toBe('p.jpg');
  });

  it('keeps a link’s headline, which has no subject to fall back to', () => {
    const record = toPromotionRecord(
      promotion({
        targetKind: PromotionTargetKind.Link,
        vendor: null,
        linkUrl: 'https://feastfest.ie',
        headline: 'https://feastfest.ie',
      }),
    );
    expect(record.headline).toBe('https://feastfest.ie');
  });

  describe('create', () => {
    it('puts the subject in the one column its kind names', () => {
      const input = toCreatePromotionInput(draft({ subject: { kind: 'event', id: 'ev-1' } }));
      expect(input).toMatchObject({
        targetKind: PromotionTargetKind.Event,
        eventId: 'ev-1',
        marketId: null,
        vendorId: null,
        productId: null,
        linkUrl: null,
        status: PromotionStatus.Draft,
      });
    });

    it('sends a reach as all four fields', () => {
      expect(toCreatePromotionInput(draft())).toMatchObject({
        isNationwide: false,
        reachLatitude: 51.9,
        reachLongitude: -8.47,
        reachRadiusKm: 30,
      });
    });

    it('leaves the reach fields out of a nationwide promotion — not null', () => {
      const input = toCreatePromotionInput(draft({ isNationwide: true }));
      expect(input.isNationwide).toBe(true);
      expect('reachLatitude' in input).toBe(false);
      expect('reachLongitude' in input).toBe(false);
      expect('reachRadiusKm' in input).toBe(false);
    });

    it('sends an empty creative as explicit null', () => {
      const input = toCreatePromotionInput(draft());
      expect(input.headline).toBeNull();
      expect(input.body).toBeNull();
      expect(input.ctaLabel).toBeNull();
    });
  });

  it('never sends the subject or the status on an update', () => {
    const input = toUpdatePromotionInput(draft());
    expect(input).not.toHaveProperty('targetKind');
    expect(input).not.toHaveProperty('vendorId');
    expect(input).not.toHaveProperty('status');
    expect(input.marketIds).toEqual([]);
  });

  it('centres on the mean of the points, and on nothing without any', () => {
    expect(
      centroidOf([
        { latitude: 52, longitude: -8 },
        { latitude: 54, longitude: -6 },
      ]),
    ).toEqual({ latitude: 53, longitude: -7 });
    expect(centroidOf([])).toBeNull();
  });
});
