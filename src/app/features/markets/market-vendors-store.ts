import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { MarketRepository } from '../../core/api/ports/market-repository';
import { CollectionStore } from '../../core/state/collection-store';
import {
  EMPTY_MARKET_VENDOR_FILTERS,
  MarketApplication,
  MarketVendor,
  MarketVendorFilters,
} from '../../core/models/market.model';

/**
 * One market's vendor roster (the Vendors tab). Provided at the `vendors`
 * route, so it is created and torn down with the tab.
 *
 * The applications ride along with the roster rather than being fetched beside
 * it: they are the same question asked one step earlier — who trades here —
 * and an organiser deciding on one is looking at the other in the same breath.
 */
@Injectable()
export class MarketVendorsStore extends CollectionStore<MarketVendor, MarketVendorFilters> {
  private readonly repo = inject(MarketRepository);

  private readonly slug = signal('');
  private readonly _applications = signal<readonly MarketApplication[]>([]);
  private readonly _feesOutstanding = signal(0);

  readonly applications = this._applications.asReadonly();
  readonly feesOutstanding = this._feesOutstanding.asReadonly();

  constructor() {
    super(EMPTY_MARKET_VENDOR_FILTERS);
  }

  protected override fetch(): Observable<readonly MarketVendor[]> {
    return this.repo.roster(this.slug()).pipe(
      tap((roster) => {
        this._applications.set(roster.applications);
        this._feesOutstanding.set(roster.feesOutstanding);
      }),
      map((roster) => roster.vendors),
    );
  }

  /** The tab knows the market; the store is told once and then reloads itself. */
  loadFor(slug: string): void {
    this.slug.set(slug);
    this.load();
  }

  /* ── Selectors ─────────────────────────────────────────────────────────── */

  readonly tradingCount = computed(
    () => this.items().filter((vendor) => vendor.standing !== 'paused').length,
  );

  readonly pausedCount = computed(
    () => this.items().filter((vendor) => vendor.standing === 'paused').length,
  );

  readonly feeUnpaidCount = computed(
    () => this.items().filter((vendor) => vendor.fee === 'unpaid').length,
  );

  readonly noStallCount = computed(
    () =>
      this.items().filter((vendor) => vendor.stall === null && vendor.standing !== 'paused').length,
  );

  /** "9 vendors at this market". */
  readonly heading = computed(() => {
    const total = this.items().length;
    return `${total} ${total === 1 ? 'vendor' : 'vendors'} at this market`;
  });

  /** "8 trading · 1 paused · €70 to collect · 1 application waiting". */
  readonly summary = computed(() => {
    const parts = [`${this.tradingCount()} trading`];
    if (this.pausedCount() > 0) parts.push(`${this.pausedCount()} paused`);
    if (this.feesOutstanding() > 0) parts.push(`€${this.feesOutstanding()} to collect`);
    const waiting = this.applications().length;
    if (waiting > 0) {
      parts.push(`${waiting} ${waiting === 1 ? 'application' : 'applications'} waiting`);
    }
    return parts.join(' · ');
  });

  readonly hasActiveFilters = computed(() => {
    const { q, feeUnpaid, paused, noStall } = this.filters();
    return q.trim() !== '' || feeUnpaid || paused || noStall;
  });

  /** The rows the table shows. The toggles narrow together — AND, not OR. */
  readonly visible = computed(() => {
    const { q, feeUnpaid, paused, noStall } = this.filters();
    const needle = q.trim().toLowerCase();

    return this.items().filter((vendor) => {
      if (feeUnpaid && vendor.fee !== 'unpaid') return false;
      if (paused && vendor.standing !== 'paused') return false;
      if (noStall && (vendor.stall !== null || vendor.standing === 'paused')) return false;
      if (needle === '') return true;
      return (
        vendor.name.toLowerCase().includes(needle) ||
        vendor.meta.toLowerCase().includes(needle) ||
        vendor.staff.some((person) => person.toLowerCase().includes(needle))
      );
    });
  });

  readonly isFilteredEmpty = computed(
    () => !this.isLoading() && this.visible().length === 0 && this.items().length > 0,
  );
}
