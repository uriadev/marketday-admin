import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { ProductRepository } from '../../core/api/ports/product-repository';
import { CollectionStore } from '../../core/state/collection-store';
import {
  EMPTY_PRODUCT_FILTERS,
  ListingStatus,
  MarketStock,
  ProductChange,
  ProductFilters,
  ProductMarket,
  SoldOutEntry,
  VendorProduct,
} from '../../core/models/product.model';

/** "Temple Bar and Marlay Park", "Temple Bar, Marlay Park and Howth". */
function sentenceList(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * A vendor's products and where each one is sold (design 3a). Provided at the
 * `products` route, so it dies with the tab.
 *
 * The two rails are **derived** from the grid rather than fetched beside it:
 * "sold out right now" and each market's tally are restatements of the same
 * listings, so flipping a cell moves all three at once and none of them can
 * drift.
 */
@Injectable()
export class VendorProductsStore extends CollectionStore<VendorProduct, ProductFilters> {
  private readonly repo = inject(ProductRepository);

  private readonly slug = signal('');
  private readonly _markets = signal<readonly ProductMarket[]>([]);
  private readonly _lastChange = signal<ProductChange | null>(null);
  /** Set while a command is in flight, so the screen can stop taking clicks. */
  private readonly _busy = signal(false);
  /** What "last change" said before the command in flight rewrote it. */
  private previousChange: ProductChange | null = null;

  readonly markets = this._markets.asReadonly();
  readonly lastChange = this._lastChange.asReadonly();
  readonly busy = this._busy.asReadonly();

  constructor() {
    super(EMPTY_PRODUCT_FILTERS);
  }

  protected override fetch(): Observable<readonly VendorProduct[]> {
    return this.repo.board(this.slug()).pipe(
      tap((board) => {
        this._markets.set(board.markets);
        this._lastChange.set(board.lastChange);
      }),
      map((board) => board.products),
    );
  }

  /** The tab knows the vendor; the store is told once and then reloads itself. */
  loadFor(slug: string): void {
    this.slug.set(slug);
    this.load();
  }

  /* ── Selectors ─────────────────────────────────────────────────────────── */

  /** Every category this vendor actually sells, for the "All categories" menu. */
  readonly categories = computed(() =>
    [...new Set(this.items().map((product) => product.category))].sort((a, b) =>
      a.localeCompare(b),
    ),
  );

  readonly soldOutCount = computed(
    () => this.items().filter((product) => this.soldOutSlugs(product).length > 0).length,
  );

  /** "14 products · 3 sold out today". */
  readonly summary = computed(() => {
    const total = this.items().length;
    const soldOut = this.soldOutCount();
    const parts = [`${total} ${total === 1 ? 'product' : 'products'}`];
    if (soldOut > 0) parts.push(`${soldOut} sold out today`);
    return parts.join(' · ');
  });

  /** The rail, newest concern first — one entry per product, not per listing. */
  readonly soldOutNow = computed<readonly SoldOutEntry[]>(() =>
    this.items()
      .filter((product) => this.soldOutSlugs(product).length > 0)
      .map((product) => {
        const marketSlugs = this.soldOutSlugs(product);
        return {
          product,
          marketSlugs,
          where: sentenceList(marketSlugs.map((slug) => this.marketLabel(slug))),
        };
      }),
  );

  /** One line per market for "Mark everything sold out". */
  readonly marketStock = computed<readonly MarketStock[]>(() =>
    this.markets().map((market) => {
      const carried = this.items().filter((product) => market.slug in product.listings);
      const available = carried.filter(
        (product) => product.listings[market.slug] === 'available',
      ).length;
      return {
        market,
        carried: carried.length,
        available,
        state: market.paused
          ? 'Paused — nothing on the shopper view'
          : `${available} of ${carried.length} carried ${
              carried.length === 1 ? 'product' : 'products'
            } available`,
      };
    }),
  );

  readonly hasActiveFilters = computed(() => {
    const { q, category, view } = this.filters();
    return q.trim() !== '' || category !== null || view !== 'all';
  });

  /** The rows the grid shows — the chip row and the two menus, narrowing together. */
  readonly visible = computed(() => {
    const { q, category, view } = this.filters();
    const needle = q.trim().toLowerCase();
    const marketCount = this.markets().length;

    return this.items().filter((product) => {
      if (category !== null && product.category !== category) return false;
      if (view === 'soldOut' && this.soldOutSlugs(product).length === 0) return false;
      if (view === 'hidden' && !product.hidden) return false;
      if (view === 'partial' && Object.keys(product.listings).length >= marketCount) return false;
      if (needle === '') return true;
      return (
        product.name.toLowerCase().includes(needle) || product.meta.toLowerCase().includes(needle)
      );
    });
  });

  readonly isFilteredEmpty = computed(
    () => !this.isLoading() && this.visible().length === 0 && this.items().length > 0,
  );

  /* ── Commands ──────────────────────────────────────────────────────────── */

  /**
   * Flips one cell. Optimistic: the fixture answers in 200ms and a real server
   * will be slower, and a stallholder tapping through a sold-out list should
   * never wait on a round trip to see the chip change.
   */
  setStatus(product: VendorProduct, marketSlug: string, status: ListingStatus): void {
    const previous = this.items();
    this.replaceAll(
      previous.map((row) =>
        row.id === product.id
          ? { ...row, listings: { ...row.listings, [marketSlug]: status } }
          : row,
      ),
    );
    this.record(
      `You marked ${product.name} ${status === 'sold-out' ? 'sold out' : 'available'} at ${this.marketLabel(marketSlug)}`,
    );
    this.run(this.repo.setStatus(this.slug(), product.id, marketSlug, status), previous);
  }

  /** Takes this vendor's whole list off one market's shopper view. */
  markMarketSoldOut(market: ProductMarket): void {
    const previous = this.items();
    this.record(`You marked everything sold out at ${market.label}`);
    this.run(this.repo.markMarketSoldOut(this.slug(), market.slug), previous, (products) =>
      this.replaceAll(products),
    );
  }

  /** What midnight does on its own, done early. */
  resetSoldOut(): void {
    const previous = this.items();
    this.record('You cleared every sold-out flag');
    this.run(this.repo.resetSoldOut(this.slug()), previous, (products) =>
      this.replaceAll(products),
    );
  }

  setHidden(product: VendorProduct, hidden: boolean): void {
    const previous = this.items();
    this.replaceAll(previous.map((row) => (row.id === product.id ? { ...row, hidden } : row)));
    this.record(
      `You ${hidden ? 'hid' : 'restored'} ${product.name} ${hidden ? 'from' : 'to'} the shopper view`,
    );
    this.run(this.repo.setHidden(this.slug(), product.id, hidden), previous);
  }

  /* ── Helpers ───────────────────────────────────────────────────────────── */

  /** Market slugs this product is sold out at, in column order. */
  soldOutSlugs(product: VendorProduct): readonly string[] {
    return this.markets()
      .map((market) => market.slug)
      .filter((slug) => product.listings[slug] === 'sold-out');
  }

  marketLabel(slug: string): string {
    return this.markets().find((market) => market.slug === slug)?.label ?? slug;
  }

  /**
   * Runs a command, rolling the optimistic write back if it fails. The rails
   * and the header are computed, so there is nothing else to undo.
   */
  private run<T>(
    command: Observable<T>,
    previous: readonly VendorProduct[],
    onSuccess?: (result: T) => void,
  ): void {
    this._busy.set(true);
    command.subscribe({
      next: (result) => {
        onSuccess?.(result);
        this._busy.set(false);
      },
      error: () => {
        this.replaceAll(previous);
        this._lastChange.set(this.previousChange);
        this._busy.set(false);
      },
    });
  }

  private record(what: string): void {
    this.previousChange = this._lastChange();
    this._lastChange.set({ what, when: 'Just now, from the console' });
  }
}
