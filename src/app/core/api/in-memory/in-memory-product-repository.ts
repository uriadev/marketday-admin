import { Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { delay } from 'rxjs/operators';
import {
  ListingStatus,
  ProductCategory,
  ProductUnit,
  VendorProduct,
  VendorProductBoard,
} from '../../models/product.model';
import { VendorMembership, VendorSummary } from '../../models/vendor.model';
import { ProductRepository } from '../ports/product-repository';
import { MARKET_LABELS, MCNALLY_DETAIL, VENDORS_FIXTURE } from './in-memory-vendor-repository';

/** "Saturdays 09:00–14:30 · Stall A7 · member since March 2021" → "Stall A7". */
function stallOf(membership: VendorMembership): string {
  return membership.detail.split(' · ').find((part) => part.startsWith('Stall')) ?? 'No stall yet';
}

/**
 * The grid's columns, from the vendor's memberships. Design 3a names a market
 * McNally doesn't belong to on the Markets tab; taking the columns from the
 * memberships instead keeps the two tabs from contradicting each other, and a
 * paused membership still gets a column — its listings are what comes back when
 * the vendor returns.
 */
function marketsOf(memberships: readonly VendorMembership[]) {
  return memberships.map((membership) => ({
    slug: membership.marketSlug,
    label: MARKET_LABELS[membership.marketSlug] ?? membership.market,
    note: membership.paused ? 'Paused' : stallOf(membership),
    paused: membership.paused,
  }));
}

type Seed = {
  name: string;
  meta: string;
  unit: ProductUnit;
  category: ProductCategory;
  hidden?: boolean;
  /** Status per market, in membership order. `null` is not carried there. */
  cells: readonly (ListingStatus | null)[];
};

/**
 * McNally's list, in the design's order and voice — the eight rows 3a draws
 * plus the six that make up the "14 products" its header counts.
 *
 * The three sold-out products are the three the design's rail names: rhubarb
 * at Temple Bar, the dozen eggs at both open markets, cherry tomatoes at
 * Marlay Park.
 */
const MCNALLY_SEEDS: readonly Seed[] = [
  {
    name: 'Rainbow chard',
    meta: 'Bunch · vegetables',
    unit: ProductUnit.Bunch,
    category: ProductCategory.Vegetable,
    cells: ['available', 'available', 'available'],
  },
  {
    name: 'Rhubarb',
    meta: '500g · vegetables',
    unit: ProductUnit.Gram,
    category: ProductCategory.Vegetable,
    cells: ['sold-out', 'available', null],
  },
  {
    name: 'Free-range eggs',
    meta: 'Half dozen · eggs',
    unit: ProductUnit.Dozen,
    category: ProductCategory.DairyAndEggs,
    cells: ['available', 'available', 'available'],
  },
  {
    name: 'Free-range eggs',
    meta: 'Dozen · eggs',
    unit: ProductUnit.Dozen,
    category: ProductCategory.DairyAndEggs,
    cells: ['sold-out', 'sold-out', 'available'],
  },
  {
    name: 'Cavolo nero',
    meta: 'Bunch · vegetables',
    unit: ProductUnit.Bunch,
    category: ProductCategory.Vegetable,
    cells: ['available', null, null],
  },
  {
    name: 'Rhubarb & ginger jam',
    meta: '220g jar · preserves',
    unit: ProductUnit.Jar,
    category: ProductCategory.HoneyAndPreserves,
    cells: ['available', 'available', null],
  },
  {
    name: 'New potatoes',
    meta: '2kg · vegetables',
    unit: ProductUnit.Kilogram,
    category: ProductCategory.Vegetable,
    hidden: true,
    cells: [null, null, null],
  },
  {
    name: 'Cherry tomatoes',
    meta: 'Punnet · vegetables',
    unit: ProductUnit.Box,
    category: ProductCategory.Vegetable,
    cells: ['available', 'sold-out', 'available'],
  },
  {
    name: 'Purple sprouting broccoli',
    meta: 'Bunch · vegetables',
    unit: ProductUnit.Bunch,
    category: ProductCategory.Vegetable,
    cells: ['available', 'available', null],
  },
  {
    name: 'Salad leaves',
    meta: '150g bag · vegetables',
    unit: ProductUnit.Bag,
    category: ProductCategory.Vegetable,
    cells: ['available', 'available', 'available'],
  },
  {
    name: 'Baby leeks',
    meta: 'Bunch · vegetables',
    unit: ProductUnit.Bunch,
    category: ProductCategory.Vegetable,
    cells: ['available', null, 'available'],
  },
  {
    name: 'Duck eggs',
    meta: 'Half dozen · eggs',
    unit: ProductUnit.Dozen,
    category: ProductCategory.DairyAndEggs,
    cells: ['available', null, null],
  },
  {
    name: 'Gooseberry jam',
    meta: '220g jar · preserves',
    unit: ProductUnit.Jar,
    category: ProductCategory.HoneyAndPreserves,
    cells: ['available', 'available', 'available'],
  },
  {
    name: 'Wild garlic pesto',
    meta: '180g jar · preserves',
    unit: ProductUnit.Jar,
    category: ProductCategory.HoneyAndPreserves,
    cells: [null, 'available', 'available'],
  },
];

function slugifyName(name: string, meta: string): string {
  return `${name} ${meta.split(' · ')[0] ?? ''}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function toProduct(seed: Seed, marketSlugs: readonly string[], index: number): VendorProduct {
  const listings: Record<string, ListingStatus> = {};
  marketSlugs.forEach((slug, i) => {
    const status = seed.cells[i];
    // A missing cell is a market this product is not carried at — no key.
    if (status) listings[slug] = status;
  });
  return {
    id: `prd-${index}-${slugifyName(seed.name, seed.meta)}`,
    name: seed.name,
    meta: seed.meta,
    unit: seed.unit,
    category: seed.category,
    imageUrl: null,
    hidden: seed.hidden ?? false,
    listings,
  };
}

/**
 * A stall's worth of products for any other vendor in the directory, so every
 * vendor's Products tab opens. Deterministic, so the screen and its tests read
 * the same on every run.
 */
const GENERIC_SEEDS: readonly Omit<Seed, 'cells'>[] = [
  {
    name: 'Seasonal box',
    meta: 'Medium · pantry',
    unit: ProductUnit.Box,
    category: ProductCategory.Pantry,
  },
  {
    name: 'House loaf',
    meta: 'Each · baked goods',
    unit: ProductUnit.Each,
    category: ProductCategory.BakedGoods,
  },
  {
    name: 'Table jar',
    meta: '220g jar · preserves',
    unit: ProductUnit.Jar,
    category: ProductCategory.HoneyAndPreserves,
  },
  {
    name: 'Market bunch',
    meta: 'Bunch · herbs',
    unit: ProductUnit.Bunch,
    category: ProductCategory.Herbs,
  },
  {
    name: 'Half kilo bag',
    meta: '500g · pantry',
    unit: ProductUnit.Gram,
    category: ProductCategory.Pantry,
  },
  {
    name: 'Weekend special',
    meta: 'Each · other',
    unit: ProductUnit.Each,
    category: ProductCategory.Other,
  },
];

function genericSeeds(vendor: VendorSummary, markets: number): Seed[] {
  return GENERIC_SEEDS.map((seed, i) => ({
    ...seed,
    hidden: i === GENERIC_SEEDS.length - 1 && vendor.name.length % 3 === 0,
    cells: Array.from({ length: markets }, (_, m) => {
      // Every product is carried at the first market; the rest thin out, and
      // one row per vendor is sold out somewhere so the rail is never empty.
      if (m > 0 && (i + m) % 3 === 0) return null;
      return (i + m) % 5 === 1 ? ('sold-out' as const) : ('available' as const);
    }),
  }));
}

function boardFor(vendor: VendorSummary, memberships: readonly VendorMembership[]) {
  const markets = marketsOf(memberships);
  const slugs = markets.map((market) => market.slug);
  const seeds =
    vendor.slug === MCNALLY_DETAIL.slug ? MCNALLY_SEEDS : genericSeeds(vendor, slugs.length);
  return {
    vendorSlug: vendor.slug,
    markets,
    products: seeds.map((seed, i) => toProduct(seed, slugs, i)),
    lastChange:
      vendor.slug === MCNALLY_DETAIL.slug
        ? {
            what: 'Bríd McNally marked Rhubarb sold out at Temple Bar',
            when: 'Today 11:20, from the vendor app',
          }
        : null,
  };
}

/**
 * The board a vendor starts the session with, or `null` when no vendor has that
 * slug. Exported so tests can stand a synchronous repository on the very
 * fixture the app ships rather than a second set of made-up products.
 */
export function buildProductBoard(vendorSlug: string): VendorProductBoard | null {
  const vendor = VENDORS_FIXTURE.find((candidate) => candidate.slug === vendorSlug);
  if (!vendor) return null;

  const memberships =
    vendorSlug === MCNALLY_DETAIL.slug
      ? MCNALLY_DETAIL.memberships
      : vendor.markets.map<VendorMembership>((label, i) => ({
          id: `mem-${i}`,
          market: label,
          marketSlug: slugForLabel(label),
          badges: [],
          detail: `Stall ${i + 1}`,
          facts: [],
          paused: vendor.standing === 'paused',
        }));

  return boardFor(vendor, memberships);
}

@Injectable()
export class InMemoryProductRepository extends ProductRepository {
  /**
   * One board per vendor, built on first read and mutable for the rest of the
   * session — flipping a cell, clearing the flags or hiding a row is real here,
   * so the grid and its rails stay in step the way they would against a server.
   */
  private readonly boards = new Map<string, VendorProductBoard>();

  override board(vendorSlug: string): Observable<VendorProductBoard> {
    const board = this.boards.get(vendorSlug) ?? buildProductBoard(vendorSlug);
    if (!board) {
      return throwError(() => new Error(`No vendor matches “${vendorSlug}”.`)).pipe(delay(300));
    }
    this.boards.set(vendorSlug, board);
    return of(board).pipe(delay(300));
  }

  override setStatus(
    vendorSlug: string,
    productId: string,
    marketSlug: string,
    status: ListingStatus,
  ): Observable<VendorProduct> {
    return this.update(
      vendorSlug,
      (product) => {
        if (product.id !== productId) return product;
        // Not carried here is not a status — there is nothing to flip.
        if (!(marketSlug in product.listings)) return product;
        return { ...product, listings: { ...product.listings, [marketSlug]: status } };
      },
      productId,
    );
  }

  override markMarketSoldOut(
    vendorSlug: string,
    marketSlug: string,
  ): Observable<readonly VendorProduct[]> {
    return this.updateAll(vendorSlug, (product) =>
      marketSlug in product.listings
        ? { ...product, listings: { ...product.listings, [marketSlug]: 'sold-out' as const } }
        : product,
    );
  }

  override resetSoldOut(vendorSlug: string): Observable<readonly VendorProduct[]> {
    return this.updateAll(vendorSlug, (product) => ({
      ...product,
      listings: Object.fromEntries(
        Object.keys(product.listings).map((slug) => [slug, 'available' as const]),
      ),
    }));
  }

  override setHidden(
    vendorSlug: string,
    productId: string,
    hidden: boolean,
  ): Observable<VendorProduct> {
    return this.update(
      vendorSlug,
      (product) => (product.id === productId ? { ...product, hidden } : product),
      productId,
    );
  }

  /** Rewrites every product, and hands the whole list back. */
  private updateAll(
    vendorSlug: string,
    map: (product: VendorProduct) => VendorProduct,
  ): Observable<readonly VendorProduct[]> {
    const board = this.boards.get(vendorSlug);
    if (!board) return this.gone();
    const products = board.products.map(map);
    this.boards.set(vendorSlug, { ...board, products });
    return of(products).pipe(delay(200));
  }

  /** Rewrites every product, and hands back the one the caller asked about. */
  private update(
    vendorSlug: string,
    map: (product: VendorProduct) => VendorProduct,
    productId: string,
  ): Observable<VendorProduct> {
    const board = this.boards.get(vendorSlug);
    if (!board) return this.gone();
    const products = board.products.map(map);
    const updated = products.find((product) => product.id === productId);
    if (!updated) return this.gone();
    this.boards.set(vendorSlug, { ...board, products });
    return of(updated).pipe(delay(200));
  }

  private gone<T>(): Observable<T> {
    return throwError(() => new Error('That product list is no longer loaded.')).pipe(delay(200));
  }
}

/** The market slug behind a short label, for vendors built from their summary. */
function slugForLabel(label: string): string {
  const entry = Object.entries(MARKET_LABELS).find(([, value]) => value === label);
  return (
    entry?.[0] ??
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  );
}
