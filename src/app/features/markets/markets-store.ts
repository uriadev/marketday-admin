import { Injectable, computed, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { MarketRepository } from '../../core/api/ports/market-repository';
import { CollectionStore } from '../../core/state/collection-store';
import {
  EMPTY_MARKET_FILTERS,
  MarketFilters,
  MarketStatus,
  MarketStatusFilter,
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

  /** Drafts still being set up — last season's markets are counted apart. */
  readonly draftCount = computed(
    () =>
      this.items().filter((market) => market.status === MarketStatus.Draft && !market.seasonEnded)
        .length,
  );

  readonly seasonEndedCount = computed(
    () => this.items().filter((market) => market.seasonEnded).length,
  );

  /** "3 trading today · 1 draft waiting on organiser details · 1 season ended". */
  readonly summary = computed(() => {
    const parts = [`${this.tradingTodayCount()} trading today`];
    const drafts = this.draftCount();
    if (drafts > 0) {
      parts.push(`${drafts} ${drafts === 1 ? 'draft' : 'drafts'} waiting on organiser details`);
    }
    const ended = this.seasonEndedCount();
    if (ended > 0) {
      parts.push(`${ended} ${ended === 1 ? 'season' : 'seasons'} ended`);
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
      if (status !== null && !matchesStatus(market, status)) return false;
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

/**
 * "Season ended" is its own answer at either stored status, so it is taken out
 * of the other two: "Draft" is a market still being set up, and "Published" is
 * one with days still to trade.
 */
function matchesStatus(market: MarketSummary, status: MarketStatusFilter): boolean {
  if (status === 'ENDED') return market.seasonEnded;
  return !market.seasonEnded && market.status === status;
}

/** ISO dates compare as strings; a market with no next day sorts after every one that has. */
function byNextDay(a: MarketSummary, b: MarketSummary): number {
  if (!a.nextMarketDay || !b.nextMarketDay) {
    return Number(!a.nextMarketDay) - Number(!b.nextMarketDay);
  }
  return a.nextMarketDay.localeCompare(b.nextMarketDay);
}

/** How full a market is, 0–1. A draft has no stalls, so it sorts last. */
function fillRate(market: MarketSummary): number {
  const metrics = market.metrics;
  if (!metrics || metrics.stallsTotal === 0) return -1;
  return metrics.stallsFilled / metrics.stallsTotal;
}

const SORTERS: Record<MarketFilters['sort'], (a: MarketSummary, b: MarketSummary) => number> = {
  next: (a, b) => byNextDay(a, b) || a.name.localeCompare(b.name),
  name: (a, b) => a.name.localeCompare(b.name),
  stalls: (a, b) => fillRate(b) - fillRate(a) || a.name.localeCompare(b.name),
};
