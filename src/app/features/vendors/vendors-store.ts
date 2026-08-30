import { Injectable, computed, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { VendorRepository } from '../../core/api/ports/vendor-repository';
import { CollectionStore } from '../../core/state/collection-store';
import { EMPTY_VENDOR_FILTERS, VendorFilters, VendorSummary } from '../../core/models/vendor.model';

/**
 * The vendor directory (design 1a). Provided at the route, so it dies with the
 * screen.
 *
 * Like the markets directory, the fixture backend hands over the whole list and
 * this narrows it client-side: `items()` is every vendor — which is what the
 * header counts report — and `visible()` is what the table pages through.
 */
@Injectable()
export class VendorsStore extends CollectionStore<VendorSummary, VendorFilters> {
  private readonly repo = inject(VendorRepository);

  constructor() {
    super(EMPTY_VENDOR_FILTERS);
  }

  protected override fetch(): Observable<readonly VendorSummary[]> {
    return this.repo.list();
  }

  /** Every market anyone trades at, for the "Market: any" menu. */
  readonly markets = computed(() =>
    [...new Set(this.items().flatMap((vendor) => vendor.markets))].sort((a, b) =>
      a.localeCompare(b),
    ),
  );

  /** Applications waiting on a decision — a new vendor, or a new market for an
   *  existing one. Both show as an amber chip in the Markets column. */
  readonly applicationCount = computed(
    () => this.items().filter((vendor) => vendor.appliedLabel !== null).length,
  );

  readonly tradingMarketCount = computed(() => this.markets().length);

  /** "Trading across 7 markets · 4 applications waiting on a decision". */
  readonly summary = computed(() => {
    const markets = this.tradingMarketCount();
    const applications = this.applicationCount();
    const parts = [`Trading across ${markets} ${markets === 1 ? 'market' : 'markets'}`];
    if (applications > 0) {
      parts.push(
        `${applications} ${
          applications === 1 ? 'application' : 'applications'
        } waiting on a decision`,
      );
    }
    return parts.join(' · ');
  });

  readonly hasActiveFilters = computed(() => {
    const { q, market, applications, multiMarket, feeUnpaid, paused } = this.filters();
    return q.trim() !== '' || market !== null || applications || multiMarket || feeUnpaid || paused;
  });

  /**
   * The rows the table shows. The four toggles narrow together (a vendor must
   * satisfy every one that is on), which is what makes "Applications" plus
   * "At 2+ markets" mean "existing multi-market vendors who want another".
   */
  readonly visible = computed(() => {
    const { q, market, applications, multiMarket, feeUnpaid, paused } = this.filters();
    const needle = q.trim().toLowerCase();

    return this.items().filter((vendor) => {
      if (market !== null && !vendor.markets.includes(market)) return false;
      if (applications && vendor.appliedLabel === null) return false;
      if (multiMarket && vendor.markets.length < 2) return false;
      if (feeUnpaid && vendor.standing !== 'fee-unpaid') return false;
      if (paused && vendor.standing !== 'paused') return false;
      if (needle === '') return true;
      return (
        vendor.name.toLowerCase().includes(needle) ||
        vendor.meta.toLowerCase().includes(needle) ||
        vendor.markets.some((label) => label.toLowerCase().includes(needle)) ||
        // The design's placeholder promises staff search, so honour it.
        vendor.staff.some((name) => name.toLowerCase().includes(needle))
      );
    });
  });

  readonly isFilteredEmpty = computed(
    () => !this.isLoading() && this.visible().length === 0 && this.items().length > 0,
  );
}
