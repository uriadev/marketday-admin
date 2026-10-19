import {
  LatLng,
  PromotionDraft,
  PromotionMarketOption,
  PromotionPlacement,
  PromotionRecord,
  PromotionServingState,
  PromotionStatus,
  PromotionSubject,
  PromotionTargetKind,
} from '../../../models/promotion.model';
import {
  AdminPromotionFieldsFragment,
  CreatePromotionInput,
  MarketStatus,
  PromotionFormQuery,
  PromotionPlacement as GqlPlacement,
  PromotionServingState as GqlServingState,
  PromotionStatus as GqlPromotionStatus,
  PromotionTargetKind as GqlTargetKind,
  UpdatePromotionInput,
} from '../generated';
import { blankToNull } from './nullable';

export type GqlPromotion = AdminPromotionFieldsFragment;
export type GqlPromotionFormMarket = PromotionFormQuery['adminMarkets'][number];

const TARGET_KIND: Record<GqlTargetKind, PromotionTargetKind> = {
  [GqlTargetKind.Event]: 'event',
  [GqlTargetKind.Market]: 'market',
  [GqlTargetKind.Vendor]: 'vendor',
  [GqlTargetKind.Product]: 'product',
  [GqlTargetKind.Link]: 'link',
};

export const GQL_TARGET_KIND: Record<PromotionTargetKind, GqlTargetKind> = {
  event: GqlTargetKind.Event,
  market: GqlTargetKind.Market,
  vendor: GqlTargetKind.Vendor,
  product: GqlTargetKind.Product,
  link: GqlTargetKind.Link,
};

const PLACEMENT: Record<GqlPlacement, PromotionPlacement> = {
  [GqlPlacement.HomeFeed]: 'home-feed',
  [GqlPlacement.MarketPage]: 'market-page',
  [GqlPlacement.EventsFeed]: 'events-feed',
  [GqlPlacement.Search]: 'search',
};

export const GQL_PLACEMENT: Record<PromotionPlacement, GqlPlacement> = {
  'home-feed': GqlPlacement.HomeFeed,
  'market-page': GqlPlacement.MarketPage,
  'events-feed': GqlPlacement.EventsFeed,
  search: GqlPlacement.Search,
};

const STATUS: Record<GqlPromotionStatus, PromotionStatus> = {
  [GqlPromotionStatus.Draft]: 'draft',
  [GqlPromotionStatus.Scheduled]: 'scheduled',
  [GqlPromotionStatus.Paused]: 'paused',
};

export const GQL_PROMOTION_STATUS: Record<PromotionStatus, GqlPromotionStatus> = {
  draft: GqlPromotionStatus.Draft,
  scheduled: GqlPromotionStatus.Scheduled,
  paused: GqlPromotionStatus.Paused,
};

const SERVING_STATE: Record<GqlServingState, PromotionServingState> = {
  [GqlServingState.Draft]: 'draft',
  [GqlServingState.Upcoming]: 'upcoming',
  [GqlServingState.Live]: 'live',
  [GqlServingState.Paused]: 'paused',
  [GqlServingState.Ended]: 'ended',
  [GqlServingState.SubjectHidden]: 'subject-hidden',
};

function subjectOf(promotion: GqlPromotion): PromotionSubject {
  const kind = TARGET_KIND[promotion.targetKind];
  const none = { id: null, link: null, imageUrl: null, vendorId: null };
  switch (kind) {
    case 'event':
      return {
        kind,
        id: promotion.event?.id ?? null,
        name: promotion.event?.title ?? 'Deleted event',
        link: promotion.event ? `/events/${promotion.event.id}` : null,
        imageUrl: promotion.event?.imageUrl ?? null,
        vendorId: null,
      };
    case 'market':
      return {
        kind,
        id: promotion.market?.id ?? null,
        name: promotion.market?.name ?? 'Unknown market',
        link: promotion.market ? `/markets/${promotion.market.slug}` : null,
        imageUrl: promotion.market?.imageUrl ?? null,
        vendorId: null,
      };
    case 'vendor':
      return {
        kind,
        id: promotion.vendor?.id ?? null,
        name: promotion.vendor?.name ?? 'Unknown vendor',
        link: promotion.vendor ? `/vendors/${promotion.vendor.slug}` : null,
        imageUrl: promotion.vendor?.imageUrl ?? null,
        vendorId: promotion.vendor?.id ?? null,
      };
    case 'product': {
      const product = promotion.product;
      return {
        kind,
        id: product?.id ?? null,
        name: product?.name ?? 'Unknown product',
        link:
          product?.vendor?.slug != null
            ? `/vendors/${product.vendor.slug}/products/${product.id}`
            : null,
        imageUrl: product?.imageUrl ?? null,
        vendorId: product?.vendorId ?? null,
      };
    }
    case 'link':
      return { ...none, kind, name: promotion.linkUrl ?? '' };
  }
}

/**
 * `headline` and `imageUrl` come back already falling back to the subject's
 * own — what the card shows. The form needs the creative alone, so a value
 * equal to the subject's is read as "no creative of its own". A creative that
 * happens to match the subject is the same card either way.
 */
export function toPromotionRecord(promotion: GqlPromotion): PromotionRecord {
  const subject = subjectOf(promotion);
  const reach =
    !promotion.isNationwide &&
    promotion.reachLatitude !== null &&
    promotion.reachLongitude !== null &&
    promotion.reachRadiusKm !== null
      ? {
          latitude: promotion.reachLatitude,
          longitude: promotion.reachLongitude,
          radiusKm: promotion.reachRadiusKm,
        }
      : null;
  return {
    id: promotion.id,
    subject,
    linkUrl: promotion.linkUrl,
    placement: PLACEMENT[promotion.placement],
    status: STATUS[promotion.status],
    servingState: SERVING_STATE[promotion.servingState],
    startsAt: new Date(promotion.startsAt),
    endsAt: new Date(promotion.endsAt),
    priority: promotion.priority,
    headline:
      subject.kind !== 'link' && promotion.headline === subject.name ? null : promotion.headline,
    displayHeadline: promotion.headline,
    body: promotion.body,
    imageUrl: promotion.imageUrl === subject.imageUrl ? null : promotion.imageUrl,
    displayImageUrl: promotion.imageUrl,
    ctaLabel: promotion.ctaLabel,
    sponsorName: promotion.sponsorName,
    sponsorVendorId: promotion.sponsorVendorId,
    isHouse: promotion.isHouse,
    disclosure: promotion.disclosure,
    isNationwide: promotion.isNationwide,
    reach,
    marketIds: promotion.marketIds,
  };
}

/** GeoJSON is `[longitude, latitude]` by definition. */
export function pointOf(
  location: { type: string; coordinates: number[] } | null | undefined,
): LatLng | null {
  const [longitude, latitude] = location?.coordinates ?? [];
  return longitude === undefined || latitude === undefined ? null : { latitude, longitude };
}

/** The plain mean of the points — markets a vendor trades at sit within a county or two. */
export function centroidOf(points: readonly LatLng[]): LatLng | null {
  if (points.length === 0) return null;
  return {
    latitude: points.reduce((sum, point) => sum + point.latitude, 0) / points.length,
    longitude: points.reduce((sum, point) => sum + point.longitude, 0) / points.length,
  };
}

export function toPromotionMarketOption(market: GqlPromotionFormMarket): PromotionMarketOption {
  return {
    id: market.id,
    name: market.name,
    isDraft: market.status !== MarketStatus.Published,
    location: pointOf(market.location),
  };
}

/**
 * The reach, as the CHECK wants it: nationwide, or a centre and a radius —
 * never neither. A nationwide reach **leaves the other three keys out**: the
 * backend's `reachOf` refuses any centre or radius beside `isNationwide`,
 * `null` included (it checks `!== undefined`), so this is an exception to
 * `blankToNull`'s explicit-null rule. Sending all four on every save is what
 * replaces the reach whole, which is how the backend wants it changed.
 */
function reachOf(
  draft: PromotionDraft,
): Pick<CreatePromotionInput, 'isNationwide' | 'reachLatitude' | 'reachLongitude' | 'reachRadiusKm'> {
  if (draft.isNationwide || !draft.reach) return { isNationwide: true };
  return {
    isNationwide: false,
    reachLatitude: draft.reach.latitude,
    reachLongitude: draft.reach.longitude,
    reachRadiusKm: Math.round(draft.reach.radiusKm),
  };
}

/** The fields create and update share. */
function common(draft: PromotionDraft) {
  return {
    placement: GQL_PLACEMENT[draft.placement],
    startsAt: draft.startsAt.toISOString(),
    endsAt: draft.endsAt.toISOString(),
    priority: Math.round(draft.priority),
    headline: blankToNull(draft.headline),
    body: blankToNull(draft.body),
    imageUrl: draft.imageUrl,
    ctaLabel: blankToNull(draft.ctaLabel),
    sponsorName: draft.sponsorName.trim(),
    sponsorVendorId: draft.sponsorVendorId,
    isHouse: draft.isHouse,
    ...reachOf(draft),
    marketIds: [...draft.marketIds],
  };
}

/**
 * The subject goes in the one column `targetKind` names; the rest are `null`,
 * which the target CHECK reads as unset.
 */
export function toCreatePromotionInput(draft: PromotionDraft): CreatePromotionInput {
  const { kind, id } = draft.subject;
  return {
    targetKind: GQL_TARGET_KIND[kind],
    eventId: kind === 'event' ? id : null,
    marketId: kind === 'market' ? id : null,
    vendorId: kind === 'vendor' ? id : null,
    productId: kind === 'product' ? id : null,
    linkUrl: kind === 'link' ? blankToNull(draft.linkUrl) : null,
    status: GQL_PROMOTION_STATUS[draft.status],
    ...common(draft),
  };
}

/** No subject and no status: both are create-only, and the status moves through its own mutation. */
export function toUpdatePromotionInput(draft: PromotionDraft): UpdatePromotionInput {
  return common(draft);
}
