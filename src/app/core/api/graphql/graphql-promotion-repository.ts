import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { PromotionRepository } from '../ports/promotion-repository';
import { PickerOption } from '../../models/picker-option.model';
import {
  LatLng,
  PromotionDirectoryPage,
  PromotionDraft,
  PromotionFilters,
  PromotionForm,
  PromotionListQuery,
  PromotionPrefill,
  PromotionRecord,
  PromotionStatus,
  PromotionSubject,
  PromotionTargetKind,
} from '../../models/promotion.model';
import { marketDate } from '../../time/market-time';
import { GraphqlClient } from './graphql-client';
import {
  ADMIN_PROMOTIONS,
  CREATE_PROMOTION,
  DELETE_PROMOTION,
  PROMOTION_EVENT_OPTIONS,
  PROMOTION_EVENT_POINT,
  PROMOTION_FORM,
  PROMOTION_PREFILL_EVENT,
  PROMOTION_PREFILL_VENDOR,
  PROMOTION_PRODUCT_OPTIONS,
  PROMOTION_PRODUCT_POINTS,
  PROMOTION_VENDOR_OPTIONS,
  PROMOTION_VENDOR_POINTS,
  SET_PROMOTION_STATUS,
  UPDATE_PROMOTION,
} from './operations/promotion';
import {
  GQL_PLACEMENT,
  GQL_PROMOTION_STATUS,
  GQL_TARGET_KIND,
  centroidOf,
  pointOf,
  toCreatePromotionInput,
  toPromotionMarketOption,
  toPromotionRecord,
  toUpdatePromotionInput,
} from './mappers/promotion-mapper';
import {
  AdminPromotionsQuery,
  AdminPromotionsQueryVariables,
  CreatePromotionMutation,
  CreatePromotionMutationVariables,
  DeletePromotionMutation,
  DeletePromotionMutationVariables,
  EventStatus,
  FilterInput,
  FilterOperator,
  MarketKind,
  OrderDirection,
  PromotionEventOptionsQuery,
  PromotionEventOptionsQueryVariables,
  PromotionEventPointQuery,
  PromotionEventPointQueryVariables,
  PromotionFormQuery,
  PromotionFormQueryVariables,
  PromotionPrefillEventQuery,
  PromotionPrefillEventQueryVariables,
  PromotionPrefillVendorQuery,
  PromotionPrefillVendorQueryVariables,
  PromotionProductOptionsQuery,
  PromotionProductOptionsQueryVariables,
  PromotionProductPointsQuery,
  PromotionProductPointsQueryVariables,
  PromotionVendorOptionsQuery,
  PromotionVendorOptionsQueryVariables,
  PromotionVendorPointsQuery,
  PromotionVendorPointsQueryVariables,
  SetPromotionStatusMutation,
  SetPromotionStatusMutationVariables,
  UpdatePromotionMutation,
  UpdatePromotionMutationVariables,
} from './generated';

/** Enough to pick from without scrolling a panel to its limit. */
const PICKER_LIMIT = 20;

function criteriaFilters(filters: PromotionFilters): FilterInput[] {
  const pushed: FilterInput[] = [];
  const needle = filters.q.trim();
  if (needle) {
    pushed.push({ field: 'sponsorName', operator: FilterOperator.Contains, value: needle });
  }
  if (filters.placement) {
    pushed.push({
      field: 'placement',
      operator: FilterOperator.Equal,
      value: GQL_PLACEMENT[filters.placement],
    });
  }
  if (filters.status) {
    pushed.push({
      field: 'status',
      operator: FilterOperator.Equal,
      value: GQL_PROMOTION_STATUS[filters.status],
    });
  }
  if (filters.targetKind) {
    pushed.push({
      field: 'targetKind',
      operator: FilterOperator.Equal,
      value: GQL_TARGET_KIND[filters.targetKind],
    });
  }
  if (filters.sponsor !== 'any') {
    pushed.push({
      field: 'isHouse',
      operator: FilterOperator.Equal,
      value: filters.sponsor === 'house',
    });
  }
  return pushed;
}

/** The public markets among a vendor's — a food truck's own stops are not where it trades. */
function marketPoints(
  markets: readonly { kind: MarketKind; location: { type: string; coordinates: number[] } | null }[],
): LatLng[] {
  return markets
    .filter((market) => market.kind === MarketKind.PublicMarket)
    .map((market) => pointOf(market.location))
    .filter((point): point is LatLng => point !== null);
}

/**
 * Promotions against the What's On context's admin surface —
 * `adminPromotions`, `adminPromotion`, `createPromotion`, `updatePromotion`,
 * `setPromotionStatus`, `deletePromotion`, all `@Roles(ADMIN)`.
 *
 * `list()` pages server-side with every filter pushed down; it orders by the
 * backend's default (most recent period first). `servingState` is derived
 * server-side from the clock and the subject and is not a column, so the
 * Status filter means the stored status — what an admin set.
 *
 * The subject pickers read the rest of the schema: `adminEvents` (drafts
 * included — an event can be booked before it is published), `adminVendors`,
 * and `products(vendorId:)`.
 */
@Injectable()
export class GraphqlPromotionRepository extends PromotionRepository {
  private readonly client = inject(GraphqlClient);

  override list(query: PromotionListQuery): Observable<PromotionDirectoryPage> {
    const { filters, page } = query;
    return this.client
      .request<AdminPromotionsQuery, AdminPromotionsQueryVariables>(ADMIN_PROMOTIONS, {
        criteria: {
          filters: criteriaFilters(filters),
          limit: page.size,
          offset: page.index * page.size,
        },
      })
      .pipe(
        map((result) => ({
          items: result.adminPromotions.items.map(toPromotionRecord),
          total: result.adminPromotions.totalCount,
          facets: {
            promotionCount: result.everyPromotion.totalCount,
            statusCounts: {
              draft: result.draftPromotions.totalCount,
              scheduled: result.scheduledPromotions.totalCount,
              paused: result.pausedPromotions.totalCount,
            },
          },
        })),
      );
  }

  override form(id: string | null, prefill: PromotionPrefill | null): Observable<PromotionForm> {
    return this.client
      .request<PromotionFormQuery, PromotionFormQueryVariables>(PROMOTION_FORM, {
        id: id ?? '',
        withPromotion: id !== null,
      })
      .pipe(
        map((result) => {
          if (id !== null && !result.adminPromotion) {
            throw new Error('That promotion no longer exists.');
          }
          return {
            promotion: result.adminPromotion ? toPromotionRecord(result.adminPromotion) : null,
            markets: result.adminMarkets.map(toPromotionMarketOption),
            prefilled: null,
          };
        }),
        // A prefill only matters on `/new`, and resolving it is a second read.
        (form$) => (id === null && prefill ? this.withPrefill(form$, prefill) : form$),
      );
  }

  override create(draft: PromotionDraft): Observable<PromotionRecord> {
    return this.client
      .request<CreatePromotionMutation, CreatePromotionMutationVariables>(CREATE_PROMOTION, {
        input: toCreatePromotionInput(draft),
      })
      .pipe(map((result) => toPromotionRecord(result.createPromotion)));
  }

  override update(id: string, draft: PromotionDraft): Observable<PromotionRecord> {
    return this.client
      .request<UpdatePromotionMutation, UpdatePromotionMutationVariables>(UPDATE_PROMOTION, {
        id,
        input: toUpdatePromotionInput(draft),
      })
      .pipe(map((result) => toPromotionRecord(result.updatePromotion)));
  }

  override setStatus(id: string, status: PromotionStatus): Observable<PromotionRecord> {
    return this.client
      .request<SetPromotionStatusMutation, SetPromotionStatusMutationVariables>(
        SET_PROMOTION_STATUS,
        { id, status: GQL_PROMOTION_STATUS[status] },
      )
      .pipe(map((result) => toPromotionRecord(result.setPromotionStatus)));
  }

  override remove(id: string): Observable<void> {
    return this.client
      .request<DeletePromotionMutation, DeletePromotionMutationVariables>(DELETE_PROMOTION, { id })
      .pipe(
        map((result) => {
          if (!result.deletePromotion) {
            throw new Error("That promotion wasn't deleted. Try again.");
          }
        }),
      );
  }

  override searchSubjects(
    kind: Exclude<PromotionTargetKind, 'link' | 'market'>,
    query: string,
  ): Observable<readonly PickerOption[]> {
    const needle = query.trim();
    if (kind === 'event') {
      return this.client
        .request<PromotionEventOptionsQuery, PromotionEventOptionsQueryVariables>(
          PROMOTION_EVENT_OPTIONS,
          {
            criteria: {
              filters: [
                ...(needle
                  ? [{ field: 'title', operator: FilterOperator.Contains, value: needle }]
                  : []),
                // An ended event can never serve; booking it would be a mistake.
                { field: 'endsAt', operator: FilterOperator.Gt, value: new Date().toISOString() },
              ],
              orderBy: 'startsAt',
              orderDir: OrderDirection.Asc,
              limit: PICKER_LIMIT,
            },
          },
        )
        .pipe(
          map((result) =>
            result.adminEvents.items.map((event) => ({
              id: event.id,
              label: event.title,
              detail: [
                event.status === EventStatus.Draft ? 'Draft' : null,
                marketDate(new Date(event.startsAt)),
                event.areaName,
              ]
                .filter(Boolean)
                .join(' · '),
            })),
          ),
        );
    }
    // A vendor subject, a product's vendor, or the sponsor: any vendor, with
    // an inactive one labelled — booking one ahead of switching it on is real.
    return this.client
      .request<PromotionVendorOptionsQuery, PromotionVendorOptionsQueryVariables>(
        PROMOTION_VENDOR_OPTIONS,
        {
          criteria: {
            filters: needle
              ? [{ field: 'name', operator: FilterOperator.Contains, value: needle }]
              : [],
            orderBy: 'name',
            orderDir: OrderDirection.Asc,
            limit: PICKER_LIMIT,
          },
        },
      )
      .pipe(
        map((result) =>
          result.adminVendors.items.map((vendor) => ({
            id: vendor.id,
            label: vendor.name,
            detail: vendor.isActive ? vendor.category : `${vendor.category} · Inactive`,
          })),
        ),
      );
  }

  override productsOf(vendorId: string): Observable<readonly PickerOption[]> {
    return this.client
      .request<PromotionProductOptionsQuery, PromotionProductOptionsQueryVariables>(
        PROMOTION_PRODUCT_OPTIONS,
        { vendorId },
      )
      .pipe(
        map((result) =>
          result.products.items.map((product) => ({
            id: product.id,
            label: product.name,
            // Sold out does not stop a product promotion serving — the card
            // greys out rather than vanishing — so it is said, not hidden.
            detail: product.isAvailable ? 'Available' : 'Sold out today',
          })),
        ),
      );
  }

  override suggestedReach(kind: PromotionTargetKind, id: string): Observable<LatLng | null> {
    switch (kind) {
      case 'event':
        return this.client
          .request<PromotionEventPointQuery, PromotionEventPointQueryVariables>(
            PROMOTION_EVENT_POINT,
            { id },
          )
          .pipe(
            map((result) =>
              result.adminEvent
                ? { latitude: result.adminEvent.latitude, longitude: result.adminEvent.longitude }
                : null,
            ),
          );
      case 'vendor':
        return this.client
          .request<PromotionVendorPointsQuery, PromotionVendorPointsQueryVariables>(
            PROMOTION_VENDOR_POINTS,
            { id },
          )
          .pipe(map((result) => centroidOf(marketPoints(result.vendor?.markets ?? []))));
      case 'product':
        return this.client
          .request<PromotionProductPointsQuery, PromotionProductPointsQueryVariables>(
            PROMOTION_PRODUCT_POINTS,
            { id },
          )
          .pipe(
            map((result) => centroidOf(marketPoints(result.product?.vendor?.markets ?? []))),
          );
      // A market's point is on the option the form already holds; a link has none.
      case 'market':
      case 'link':
        return of(null);
    }
  }

  /**
   * Resolves the subject a `?eventId=` / `?vendorId=` / `?marketId=` link
   * named. A stale link still opens a usable, empty form.
   */
  private withPrefill(
    form$: Observable<PromotionForm>,
    prefill: PromotionPrefill,
  ): Observable<PromotionForm> {
    return form$.pipe(
      switchMap((form) =>
        this.prefilledSubject(form, prefill).pipe(
          map((prefilled) => ({ ...form, prefilled })),
          catchError(() => of(form)),
        ),
      ),
    );
  }

  private prefilledSubject(
    form: PromotionForm,
    prefill: PromotionPrefill,
  ): Observable<PromotionSubject | null> {
    const base = { link: null, vendorId: null };
    switch (prefill.kind) {
      case 'market': {
        const market = form.markets.find((option) => option.id === prefill.id);
        return of(
          market
            ? { ...base, kind: 'market', id: market.id, name: market.name, imageUrl: null }
            : null,
        );
      }
      case 'event':
        return this.client
          .request<PromotionPrefillEventQuery, PromotionPrefillEventQueryVariables>(
            PROMOTION_PREFILL_EVENT,
            { id: prefill.id },
          )
          .pipe(
            map(({ adminEvent: event }) =>
              event
                ? {
                    ...base,
                    kind: 'event',
                    id: event.id,
                    name: event.title,
                    link: `/events/${event.id}`,
                    imageUrl: event.imageUrl,
                  }
                : null,
            ),
          );
      case 'vendor':
        return this.client
          .request<PromotionPrefillVendorQuery, PromotionPrefillVendorQueryVariables>(
            PROMOTION_PREFILL_VENDOR,
            { id: prefill.id },
          )
          .pipe(
            map(({ vendor }) =>
              vendor
                ? {
                    kind: 'vendor',
                    id: vendor.id,
                    name: vendor.name,
                    link: `/vendors/${vendor.slug}`,
                    imageUrl: vendor.imageUrl,
                    vendorId: vendor.id,
                  }
                : null,
            ),
          );
    }
  }
}
