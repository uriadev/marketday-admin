import { Injectable, computed, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { MarketRepository } from '../../core/api/ports/market-repository';
import { CollectionStore } from '../../core/state/collection-store';
import {
  EMPTY_MARKET_FILTERS,
  MarketFilters,
  MarketStatus,
  MarketSummary,
  TRADING_DAYS,
} from '../../core/models/market.model';

/**
 * The markets directory (design 1f). Provided at the route, so it dies with the
 * screen.
 *
 * The fixture backend hands over the whole directory in one call, so filtering
 * and sorting happen here rather than in a round trip: `items()` is always
 * every market the signed-in user can see — which is what the header counts
 * report — and `visible()` is what the card grid renders.
 */
@Injectable()
export class MarketsStore extends CollectionStore<MarketSummary, MarketFilters> {
  private readonly repo = inject(MarketRepository);

  constructor() {
    super(EMPTY_MARKET_FILTERS);
  }

  protected override fetch(): Observable<readonly MarketSummary[]> {
    return this.repo.list();
  }

  /** Filter options, derived from the data rather than hard-coded. */
  readonly counties = computed(() =>
    [...new Set(this.items().map((market) => market.county))].sort((a, b) => a.localeCompare(b)),
  );

  readonly days = computed(() => {
    const trading = new Set(this.items().flatMap((market) => market.days));
    return TRADING_DAYS.filter((day) => trading.has(day));
  });

  readonly tradingTodayCount = computed(
    () => this.items().filter((market) => market.tradingToday).length,
  );

  readonly draftCount = computed(
    () => this.items().filter((market) => market.status === MarketStatus.Draft).length,
  );

  /** "3 trading today · 1 draft waiting on organiser details". */
  readonly summary = computed(() => {
    const parts = [`${this.tradingTodayCount()} trading today`];
    const drafts = this.draftCount();
    if (drafts > 0) {
      parts.push(`${drafts} ${drafts === 1 ? 'draft' : 'drafts'} waiting on organiser details`);
    }
    return parts.join(' · ');
  });

  readonly hasActiveFilters = computed(() => {
    const { q, county, day, status } = this.filters();
    return q.trim() !== '' || county !== null || day !== null || status !== null;
  });

  /** The cards the grid renders: `items()` narrowed by `filters()`, then sorted. */
  readonly visible = computed(() => {
    const { q, county, day, status, sort } = this.filters();
    const needle = q.trim().toLowerCase();

    const matches = this.items().filter((market) => {
      if (county !== null && market.county !== county) return false;
      if (day !== null && !market.days.includes(day)) return false;
      if (status !== null && market.status !== status) return false;
      if (needle === '') return true;
      return (
        market.name.toLowerCase().includes(needle) ||
        market.when.toLowerCase().includes(needle) ||
        market.county.toLowerCase().includes(needle)
      );
    });

    return [...matches].sort(SORTERS[sort]);
  });

  /** True when filters are on and nothing survived them — a different message
   *  from an empty directory, so the screen can offer "Clear filters". */
  readonly isFilteredEmpty = computed(
    () => !this.isLoading() && this.visible().length === 0 && this.items().length > 0,
  );
}

/** How full a market is, 0–1. A draft has no stalls, so it sorts last. */
function fillRate(market: MarketSummary): number {
  const metrics = market.metrics;
  if (!metrics || metrics.stallsTotal === 0) return -1;
  return metrics.stallsFilled / metrics.stallsTotal;
}

const SORTERS: Record<MarketFilters['sort'], (a: MarketSummary, b: MarketSummary) => number> = {
  next: (a, b) => a.nextMarketDay.localeCompare(b.nextMarketDay) || a.name.localeCompare(b.name),
  name: (a, b) => a.name.localeCompare(b.name),
  stalls: (a, b) => fillRate(b) - fillRate(a) || a.name.localeCompare(b.name),
};
