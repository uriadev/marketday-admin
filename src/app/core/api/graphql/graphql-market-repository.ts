import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { MarketRepository } from '../ports/market-repository';
import {
  MarketDetail,
  MarketDraft,
  MarketRoster,
  MarketSchedulePatch,
  MarketSettingsPatch,
  MarketStallPlan,
  MarketSummary,
} from '../../models/market.model';
import { IRISH_COUNTIES } from '../../models/location.model';
import { InMemoryMarketRepository } from '../in-memory/in-memory-market-repository';
import { GraphqlClient } from './graphql-client';
import {
  ADMIN_MARKETS,
  CREATE_MARKET,
  GENERATE_OCCURRENCES,
  MARKET_BY_ID,
  MARKET_VENDORS,
  UPDATE_MARKET,
} from './operations/market';
import {
  GqlMarket,
  toCreateVariables,
  toMarketDetail,
  toMarketRoster,
  toMarketSummary,
  toSchedulePatch,
  toSettingsPatch,
  toUpdateVariablesFromDraft,
  toUpdateVariablesFromSchedule,
  toUpdateVariablesFromSettings,
} from './mappers/market-mapper';
import {
  AdminMarketsQuery,
  AdminMarketsQueryVariables,
  CreateMarketMutation,
  CreateMarketMutationVariables,
  GenerateMarketOccurrencesMutation,
  GenerateMarketOccurrencesMutationVariables,
  MarketByIdQuery,
  MarketByIdQueryVariables,
  MarketVendorsForRosterQuery,
  MarketVendorsForRosterQueryVariables,
  UpdateMarketMutation,
  UpdateMarketMutationVariables,
} from './generated';

/**
 * `adminMarkets`/`market`/`createMarket`/`updateMarket`/`generateOccurrences`
 * are all `@Roles(ADMIN)` and real — the deepest coverage of any port
 * (`docs/backend-api-gaps.md` has nothing open against market CRUD itself).
 * Two things the schema cannot answer are delegated to a private, unshared
 * `InMemoryMarketRepository` rather than faked here:
 *
 * - The stall map (`stallPlan`/`saveStallPlan`) — gap #4. There is no
 *   pitch/stall model server-side at all. The fixture only has data for its
 *   own market slugs, so a market created through the real wizard will show
 *   an empty map until the backend grows one.
 * - `counties()` — not delegated for lack of an endpoint, just because one
 *   would be pointless: `IRISH_COUNTIES` is static reference data, so it is
 *   returned directly rather than round-tripped.
 */
@Injectable()
export class GraphqlMarketRepository extends MarketRepository {
  private readonly client = inject(GraphqlClient);
  /** No server model for the stall map — see the class doc above. */
  private readonly fixture = new InMemoryMarketRepository();

  /** `market(id)` and `vendor(id)` are ID-only; the console routes by slug. */
  private readonly idBySlug = new Map<string, string>();

  override list(): Observable<readonly MarketSummary[]> {
    return this.fetchAdminMarkets().pipe(map((markets) => markets.map(toMarketSummary)));
  }

  override detail(slug: string): Observable<MarketDetail> {
    return this.resolveId(slug).pipe(
      switchMap((id) =>
        forkJoin({
          market: this.fetchMarket(id),
          vendorCount: this.fetchVendorCount(id),
        }),
      ),
      map(({ market, vendorCount }) => toMarketDetail(market, vendorCount)),
    );
  }

  override roster(slug: string): Observable<MarketRoster> {
    return this.resolveId(slug).pipe(
      switchMap((id) =>
        this.client.request<MarketVendorsForRosterQuery, MarketVendorsForRosterQueryVariables>(
          MARKET_VENDORS,
          { marketId: id },
        ),
      ),
      map((result) => toMarketRoster(result.vendors.items)),
    );
  }

  override schedule(slug: string): Observable<MarketSchedulePatch> {
    return this.resolveId(slug).pipe(
      switchMap((id) => this.fetchMarket(id)),
      map(toSchedulePatch),
    );
  }

  override saveSchedule(slug: string, patch: MarketSchedulePatch): Observable<MarketSchedulePatch> {
    return this.resolveId(slug).pipe(
      switchMap((id) => {
        const vars = toUpdateVariablesFromSchedule(id, patch);
        return this.client.request<UpdateMarketMutation, UpdateMarketMutationVariables>(
          UPDATE_MARKET,
          vars,
        );
      }),
      map((result) => toSchedulePatch(result.updateMarket)),
    );
  }

  override settings(slug: string): Observable<MarketSettingsPatch> {
    return this.resolveId(slug).pipe(
      switchMap((id) => this.fetchMarket(id)),
      map(toSettingsPatch),
    );
  }

  override saveSettings(slug: string, patch: MarketSettingsPatch): Observable<MarketSettingsPatch> {
    return this.resolveId(slug).pipe(
      switchMap((id) => {
        const vars = toUpdateVariablesFromSettings(id, patch);
        return this.client.request<UpdateMarketMutation, UpdateMarketMutationVariables>(
          UPDATE_MARKET,
          vars,
        );
      }),
      map((result) => toSettingsPatch(result.updateMarket)),
    );
  }

  override stallPlan(slug: string): Observable<MarketStallPlan> {
    return this.fixture.stallPlan(slug);
  }

  override saveStallPlan(slug: string, plan: MarketStallPlan): Observable<MarketStallPlan> {
    return this.fixture.saveStallPlan(slug, plan);
  }

  override counties(): Observable<readonly string[]> {
    return of(IRISH_COUNTIES);
  }

  /**
   * One `market(id)` read, split back into the three groups the wizard binds.
   * `toSettingsPatch` and `toSchedulePatch` between them cover every field of a
   * `MarketDraft`, so there is nothing here for a third mapper to do.
   */
  override draft(slug: string): Observable<MarketDraft> {
    return this.resolveId(slug).pipe(
      switchMap((id) => this.fetchMarket(id)),
      map((market) => ({ ...toSettingsPatch(market), ...toSchedulePatch(market) })),
    );
  }

  override saveDraft(draft: MarketDraft): Observable<MarketSummary> {
    return this.upsert(draft, false);
  }

  override publish(draft: MarketDraft): Observable<MarketSummary> {
    return this.upsert(draft, true).pipe(
      switchMap((summary) => this.generateOccurrences(summary.id).pipe(map(() => summary))),
    );
  }

  /**
   * `createMarket` on the first save for a slug, `updateMarket` on every one
   * after — keyed by the slug→id map, which is what keeps this idempotent
   * across the wizard's autosave-per-step (`MarketRepository.saveDraft`'s
   * documented contract).
   */
  private upsert(draft: MarketDraft, publish: boolean): Observable<MarketSummary> {
    const known = this.idBySlug.get(draft.slug);
    if (known) {
      const vars = toUpdateVariablesFromDraft(known, draft, publish);
      return this.client
        .request<UpdateMarketMutation, UpdateMarketMutationVariables>(UPDATE_MARKET, vars)
        .pipe(map((result) => this.remember(result.updateMarket)));
    }
    const vars = toCreateVariables(draft, publish);
    return this.client
      .request<CreateMarketMutation, CreateMarketMutationVariables>(CREATE_MARKET, vars)
      .pipe(map((result) => this.remember(result.createMarket)));
  }

  private generateOccurrences(id: string): Observable<void> {
    return this.client
      .request<GenerateMarketOccurrencesMutation, GenerateMarketOccurrencesMutationVariables>(
        GENERATE_OCCURRENCES,
        { id },
      )
      .pipe(map(() => undefined));
  }

  private fetchAdminMarkets(): Observable<readonly GqlMarket[]> {
    return this.client
      .request<AdminMarketsQuery, AdminMarketsQueryVariables>(ADMIN_MARKETS, {})
      .pipe(
        map((result) => {
          for (const market of result.adminMarkets) this.idBySlug.set(market.slug, market.id);
          return result.adminMarkets;
        }),
      );
  }

  private fetchMarket(id: string): Observable<GqlMarket> {
    return this.client
      .request<MarketByIdQuery, MarketByIdQueryVariables>(MARKET_BY_ID, { id })
      .pipe(
        map((result) => {
          if (!result.market) throw new Error('That market could not be found.');
          this.idBySlug.set(result.market.slug, result.market.id);
          return result.market;
        }),
      );
  }

  private fetchVendorCount(id: string): Observable<number> {
    return this.client
      .request<MarketVendorsForRosterQuery, MarketVendorsForRosterQueryVariables>(MARKET_VENDORS, {
        marketId: id,
      })
      .pipe(map((result) => result.vendors.totalCount));
  }

  /** Refills the slug→id map from `adminMarkets` when asked for an unknown slug. */
  private resolveId(slug: string): Observable<string> {
    const known = this.idBySlug.get(slug);
    if (known) return of(known);
    return this.fetchAdminMarkets().pipe(
      map(() => {
        const id = this.idBySlug.get(slug);
        if (!id) throw new Error('That market could not be found.');
        return id;
      }),
    );
  }

  private remember(market: GqlMarket): MarketSummary {
    this.idBySlug.set(market.slug, market.id);
    return toMarketSummary(market);
  }
}
