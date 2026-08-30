import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Avatar } from '../../shared/components/avatar/avatar';
import { EmptyState } from '../../shared/components/empty-state/empty-state';
import { StatusPill } from '../../shared/components/status-pill/status-pill';
import {
  PRODUCT_CATEGORY_LABELS,
  PRODUCT_VIEWS,
  ProductCategory,
  ProductFilters,
  ProductMarket,
  ProductView,
  VendorProduct,
} from '../../core/models/product.model';
import { Notifications } from '../../core/notifications/notifications';
import { VendorProductsStore } from './vendor-products-store';

/** The design's grid — a page you can take in without scrolling the table. */
const PAGE_SIZE = 10;

/**
 * The Products tab of a vendor (design 3a): one row per product, one column per
 * market, and a status in every cell the vendor carries that product at.
 *
 * There are only two statuses. A product not carried at a market has no cell to
 * flip — it reads "Not carried" rather than pretending to be a third state — and
 * nothing here records a quantity, because a stallholder updating this from
 * their phone can keep "sold out" honest and cannot keep a count honest.
 */
@Component({
  selector: 'md-vendor-products',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    Avatar,
    EmptyState,
    StatusPill,
    MatButtonModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatTableModule,
    MatTooltipModule,
  ],
  templateUrl: './vendor-products.html',
  styleUrl: './vendor-products.css',
})
export class VendorProducts {
  /** Bound from the parent `:slug` route param by `withComponentInputBinding()`. */
  readonly slug = input.required<string>();

  /** Filters arrive as query params (§7); an absent one binds as `undefined`. */
  readonly q = input<string>();
  readonly category = input<string>();
  readonly view = input<string>();

  protected readonly store = inject(VendorProductsStore);
  private readonly router = inject(Router);
  private readonly notifications = inject(Notifications);

  protected readonly views = PRODUCT_VIEWS;
  protected readonly categoryLabels = PRODUCT_CATEGORY_LABELS;

  protected readonly filters = computed<ProductFilters>(() => ({
    q: this.q() ?? '',
    category: this.asCategory(this.category()),
    view: this.asView(this.view()),
  }));

  /** Page position is view state, not something worth putting in a link. */
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = signal(PAGE_SIZE);

  /** Product, then one column per market, then the row menu. */
  protected readonly columns = computed(() => [
    'product',
    ...this.store.markets().map((market) => this.columnOf(market)),
    'actions',
  ]);

  protected readonly page = computed(() => {
    const start = this.pageIndex() * this.pageSize();
    return this.store.visible().slice(start, start + this.pageSize());
  });

  constructor() {
    effect(() => this.store.loadFor(this.slug()));
    // The URL is the source of truth; the store follows it.
    effect(() => this.store.setFilters(this.filters()));
    // A narrower list can be shorter than the page you were on.
    effect(() => {
      this.store.visible();
      this.pageIndex.set(0);
    });
  }

  protected columnOf(market: ProductMarket): string {
    return `market-${market.slug}`;
  }

  /* ── Filters ───────────────────────────────────────────────────────────── */

  protected setParam(patch: Record<string, string | null>): void {
    void this.router.navigate([], {
      queryParams: patch,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected clearFilters(): void {
    this.setParam({ q: null, category: null, view: null });
  }

  protected onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.setParam({ q: value === '' ? null : value });
  }

  protected setView(value: ProductView | null): void {
    this.setParam({ view: value === null || value === 'all' ? null : value });
  }

  protected setCategory(value: ProductCategory | null): void {
    this.setParam({ category: value });
  }

  /** "All categories" until one is chosen. */
  protected readonly categoryLabel = computed(() => {
    const chosen = this.filters().category;
    return chosen === null ? 'All categories' : PRODUCT_CATEGORY_LABELS[chosen];
  });

  protected onPage(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
  }

  /* ── Cells ─────────────────────────────────────────────────────────────── */

  protected isCarried(product: VendorProduct, market: ProductMarket): boolean {
    return market.slug in product.listings;
  }

  protected isSoldOut(product: VendorProduct, market: ProductMarket): boolean {
    return product.listings[market.slug] === 'sold-out';
  }

  protected cellLabel(product: VendorProduct, market: ProductMarket): string {
    return this.isSoldOut(product, market) ? 'Sold out' : 'Available';
  }

  /** What clicking the chip will do, for the tooltip and the screen reader. */
  protected cellAction(product: VendorProduct, market: ProductMarket): string {
    const next = this.isSoldOut(product, market) ? 'available' : 'sold out';
    return `Mark ${product.name} (${product.meta}) ${next} at ${market.label}`;
  }

  protected toggleCell(product: VendorProduct, market: ProductMarket): void {
    const next = this.isSoldOut(product, market) ? 'available' : 'sold-out';
    this.store.setStatus(product, market.slug, next);
  }

  /* ── Commands ──────────────────────────────────────────────────────────── */

  protected restock(product: VendorProduct, marketSlugs: readonly string[]): void {
    for (const slug of marketSlugs) {
      this.store.setStatus(product, slug, 'available');
    }
    this.notifications.success(`${product.name} is back on the shopper view.`);
  }

  protected markMarketSoldOut(market: ProductMarket): void {
    this.store.markMarketSoldOut(market);
    this.notifications.info(`Everything is sold out at ${market.label} until midnight.`);
  }

  protected resetSoldOut(): void {
    this.store.resetSoldOut();
    this.notifications.success('Every sold-out flag is cleared.');
  }

  protected setHidden(product: VendorProduct, hidden: boolean): void {
    this.store.setHidden(product, hidden);
    this.notifications.info(
      hidden
        ? `${product.name} is hidden from shoppers at every market.`
        : `${product.name} is back on the shopper view.`,
    );
  }

  /* ── Query-param parsing ───────────────────────────────────────────────── */

  private asView(value: string | undefined): ProductView {
    return PRODUCT_VIEWS.some((option) => option.value === value) ? (value as ProductView) : 'all';
  }

  private asCategory(value: string | undefined): ProductCategory | null {
    if (!value) return null;
    return Object.values(ProductCategory).includes(value as ProductCategory)
      ? (value as ProductCategory)
      : null;
  }
}
