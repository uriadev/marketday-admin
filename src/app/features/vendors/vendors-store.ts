import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { VendorRepository } from '../../core/api/ports/vendor-repository';
import { PagedCollectionStore } from '../../core/state/paged-collection-store';
import { PageRequest } from '../../core/models/page.model';
import {
  EMPTY_VENDOR_FILTERS,
  VendorDirectoryFacets,
  VendorDirectoryPage,
  VendorFilters,
  VendorSummary,
  hasVendorFilters,
} from '../../core/models/vendor.model';

/**
 * The vendor directory (design 1a). Provided at the route, so it dies with the
 * screen.
 *
 * Paged by the backend rather than in the browser: `items()` is the page on
 * screen, `total()` the rows behind the filters, and every page turn, page-size
 * change and filter change is a fresh read (`PagedCollectionStore`). The
 * directory-wide lines the header and the market menu show cannot come from a
 * page, so the repository hands them over with it — {@link markets},
 * {@link applicationCount} and {@link vendorCount} are that, not aggregates of
 * the rows on screen.
 */
@Injectable()
export class VendorsStore extends PagedCollectionStore<VendorSummary, VendorFilters> {
  private readonly repo = inject(VendorRepository);

  private readonly _facets = signal<VendorDirectoryFacets>({
    markets: [],
    applicationCount: 0,
    vendorCount: 0,
  });
  /** Slugs with an activate / deactivate in flight, so each row stops taking clicks on its own. */
  private readonly _pending = signal<ReadonlySet<string>>(new Set());
  private readonly _commandError = signal<string | null>(null);

  /** Why the last activate / deactivate was refused, or `null`. */
  readonly commandError = this._commandError.asReadonly();

  constructor() {
    super(EMPTY_VENDOR_FILTERS);
  }

  protected override fetchPage(
    filters: VendorFilters,
    page: PageRequest,
  ): Observable<VendorDirectoryPage> {
    return this.repo.list({ filters, page }).pipe(tap((result) => this._facets.set(result.facets)));
  }

  /** Every market anyone trades at, for the "Market: any" menu. */
  readonly markets = computed(() => this._facets().markets);

  /** Applications waiting on a decision — a new vendor, or a new market for an
   *  existing one. Both show as an amber chip in the Markets column. */
  readonly applicationCount = computed(() => this._facets().applicationCount);

  /** Vendors on the platform, whatever the filters narrow the table to. */
  readonly vendorCount = computed(() => this._facets().vendorCount);

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

  readonly hasActiveFilters = computed(() => hasVendorFilters(this.filters()));

  /** Whether this vendor's activate / deactivate is waiting on the server. */
  isPending(vendor: VendorSummary): boolean {
    return this._pending().has(vendor.slug);
  }

  /**
   * Activates or deactivates a vendor. Not optimistic: the row on screen changes
   * only once the server has agreed — a refusal leaves it where it was, with the
   * reason in {@link commandError}, rather than showing a state the backend
   * never stored.
   *
   * The row is swapped for the one the server answers with. The Paused filter
   * is the only one this can change, so the page is read again only when it is
   * on — a row that no longer matches has to leave, and the count under the
   * paginator moved with it. `onDone` runs with that row, on success only.
   */
  setActive(
    vendor: VendorSummary,
    active: boolean,
    onDone: (updated: VendorSummary) => void = () => undefined,
  ): void {
    if (this.isPending(vendor)) return;
    this._commandError.set(null);
    this.markPending(vendor.slug, true);

    this.repo.setActive(vendor.slug, active).subscribe({
      next: (row) => {
        this.replaceAll(this.items().map((item) => (item.id === row.id ? row : item)));
        this.markPending(vendor.slug, false);
        if (this.filters().paused) this.load();
        onDone(row);
      },
      error: (cause: unknown) => {
        this._commandError.set(
          cause instanceof Error ? cause.message : 'That vendor could not be updated.',
        );
        this.markPending(vendor.slug, false);
      },
    });
  }

  private markPending(slug: string, pending: boolean): void {
    this._pending.update((current) => {
      const next = new Set(current);
      if (pending) next.add(slug);
      else next.delete(slug);
      return next;
    });
  }

  /**
   * Nothing matched, but the directory is not empty — the state that offers a
   * way out rather than an "invite your first vendor" pitch. Read from the
   * totals because the rows to compare are on a page that was never fetched.
   */
  readonly isFilteredEmpty = computed(
    () => !this.isLoading() && this.total() === 0 && this.vendorCount() > 0,
  );
}
