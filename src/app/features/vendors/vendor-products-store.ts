import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ProductRepository } from '../../core/api/ports/product-repository';
import { PagedCollectionStore } from '../../core/state/paged-collection-store';
import { PageRequest } from '../../core/models/page.model';
import {
  EMPTY_PRODUCT_FACETS,
  EMPTY_PRODUCT_FILTERS,
  ListingStatus,
  ProductBoardFacets,
  ProductChange,
  ProductFilters,
  ProductListQuery,
  ProductMarket,
  VendorProduct,
  VendorProductBoardPage,
  soldOutAt,
} from '../../core/models/product.model';

/** The design's grid — a page you can take in without scrolling the table. */
export const PRODUCT_PAGE_SIZE = 10;

/**
 * A vendor's products and where each one is sold (design 3a). Provided at the
 * `products` route, so it dies with the tab.
 *
 * `items()` is one page of the catalogue, so the two rails cannot be derived
 * from it any more — "sold out right now" and each market's tally are
 * restatements of *every* listing this vendor has, and most of them are not on
 * screen. They arrive as facets beside the page instead, and every command
 * answers with a fresh page and facets together, so flipping a cell still moves
 * all three at once and none of them can drift.
 */
@Injectable()
export class VendorProductsStore extends PagedCollectionStore<VendorProduct, ProductFilters> {
  private readonly repo = inject(ProductRepository);

  private readonly slug = signal('');
  private readonly _markets = signal<readonly ProductMarket[]>([]);
  private readonly _facets = signal<ProductBoardFacets>(EMPTY_PRODUCT_FACETS);
  private readonly _lastChange = signal<ProductChange | null>(null);
  /** Set while a command is in flight, so the screen can stop taking clicks. */
  private readonly _busy = signal(false);
  /** What "last change" said before the command in flight rewrote it. */
  private previousChange: ProductChange | null = null;

  readonly markets = this._markets.asReadonly();
  readonly lastChange = this._lastChange.asReadonly();
  readonly busy = this._busy.asReadonly();

  constructor() {
    super(EMPTY_PRODUCT_FILTERS, PRODUCT_PAGE_SIZE);
  }

  protected override fetchPage(
    filters: ProductFilters,
    page: PageRequest,
  ): Observable<VendorProductBoardPage> {
    return this.repo.board(this.slug(), { filters, page }).pipe(
      tap((board) => {
        this.absorb(board);
        // Only a load takes the board's own "last change": after a command it
        // is this session's sentence, written by `record` before the write went
        // out, and the server's copy is older than what just happened.
        this._lastChange.set(board.lastChange);
      }),
    );
  }

  /**
   * Which vendor's board this is. Does **not** load: the tab sets the vendor
   * and the filters in one effect, and `setFilters` is what goes to the
   * repository — two loads for one navigation would be one wasted read and a
   * race to settle it. A different vendor starts at the first page.
   */
  setVendor(slug: string): void {
    if (this.slug() === slug) return;
    this.slug.set(slug);
  }

  /** The query the commands below have to answer with — the page on screen. */
  private get query(): ProductListQuery {
    return {
      filters: this.filters(),
      page: { index: this.pageIndex(), size: this.pageSize() },
    };
  }

  /** Columns and rails from one answer, so the grid and the rails agree. */
  private absorb(board: VendorProductBoardPage): void {
    this._markets.set(board.markets);
    this._facets.set(board.facets);
  }

  /* ── Selectors ─────────────────────────────────────────────────────────── */

  /** Every category this vendor actually sells, for the "All categories" menu. */
  readonly categories = computed(() => this._facets().categories);

  /** Products in the catalogue, whatever the filters narrow the grid to. */
  readonly productCount = computed(() => this._facets().productCount);

  readonly soldOutCount = computed(() => this._facets().soldOut.length);

  /** "14 products · 3 sold out today". */
  readonly summary = computed(() => {
    const total = this.productCount();
    const soldOut = this.soldOutCount();
    const parts = [`${total} ${total === 1 ? 'product' : 'products'}`];
    if (soldOut > 0) parts.push(`${soldOut} sold out today`);
    return parts.join(' · ');
  });

  /** The rail — one entry per product, not per listing, across the catalogue. */
  readonly soldOutNow = computed(() => this._facets().soldOut);

  /** One line per market for "Mark everything sold out". */
  readonly marketStock = computed(() => this._facets().stock);

  readonly hasActiveFilters = computed(() => {
    const { q, category, view } = this.filters();
    return q.trim() !== '' || category !== null || view !== 'all';
  });

  /** Nothing matched, but this vendor does sell something. */
  readonly isFilteredEmpty = computed(
    () => !this.isLoading() && this.total() === 0 && this.productCount() > 0,
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
    this.run(
      this.repo.setStatus(this.slug(), product.id, marketSlug, status, this.query),
      previous,
    );
  }

  /** Takes this vendor's whole list off one market's shopper view. */
  markMarketSoldOut(market: ProductMarket): void {
    const previous = this.items();
    this.record(`You marked everything sold out at ${market.label}`);
    this.run(this.repo.markMarketSoldOut(this.slug(), market.slug, this.query), previous);
  }

  /** What midnight does on its own, done early. */
  resetSoldOut(): void {
    const previous = this.items();
    this.record('You cleared every sold-out flag');
    this.run(this.repo.resetSoldOut(this.slug(), this.query), previous);
  }

  setHidden(product: VendorProduct, hidden: boolean): void {
    const previous = this.items();
    this.replaceAll(previous.map((row) => (row.id === product.id ? { ...row, hidden } : row)));
    this.record(
      `You ${hidden ? 'hid' : 'restored'} ${product.name} ${hidden ? 'from' : 'to'} the shopper view`,
    );
    this.run(this.repo.setHidden(this.slug(), product.id, hidden, this.query), previous);
  }

  /* ── Helpers ───────────────────────────────────────────────────────────── */

  /** Market slugs this product is sold out at, in column order. */
  soldOutSlugs(product: VendorProduct): readonly string[] {
    return soldOutAt(product, this.markets());
  }

  marketLabel(slug: string): string {
    return this.markets().find((market) => market.slug === slug)?.label ?? slug;
  }

  /**
   * Runs a command and takes the board page it answers with — the rows, the
   * rails and the tallies in one consistent snapshot, so an optimistic cell
   * flip is confirmed by the same read that restates the rail rather than by a
   * second one. A failure rolls the optimistic write back; `lastChange` is
   * restored with it, since it announced something that did not happen.
   */
  private run(
    command: Observable<VendorProductBoardPage>,
    previous: readonly VendorProduct[],
  ): void {
    this._busy.set(true);
    command.subscribe({
      next: (board) => {
        this.replaceAll(board.items);
        this.absorb(board);
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
