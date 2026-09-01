import { Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { delay } from 'rxjs/operators';
import {
  ListingStatus,
  ProductCategory,
  ProductChange,
  ProductDraft,
  ProductForm,
  ProductMarket,
  ProductUnit,
  VendorProduct,
  VendorProductBoard,
  productMeta,
  sentenceList,
} from '../../models/product.model';
import { VendorMembership, VendorSummary } from '../../models/vendor.model';
import { ProductRepository } from '../ports/product-repository';
import { MCNALLY_DETAIL, VENDORS_FIXTURE } from './in-memory-vendor-repository';
import { MARKET_LABELS } from './market-fixture';

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
  /** Euro per unit — what the shopper view and the product form price from. */
  price: number;
  description?: string;
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
    price: 3.0,
    description: 'Five colours in a bunch — the stalks keep their colour if you cook them fast.',
    unit: ProductUnit.Bunch,
    category: ProductCategory.Vegetable,
    cells: ['available', 'available', 'available'],
  },
  {
    name: 'Rhubarb',
    meta: '500g · vegetables',
    price: 4.0,
    description:
      'Forced early rhubarb, cut the morning of the market. Stalks are thin and very pink; they cook down fast.',
    unit: ProductUnit.Gram,
    category: ProductCategory.Vegetable,
    cells: ['sold-out', 'available', null],
  },
  {
    name: 'Free-range eggs',
    meta: 'Half dozen · eggs',
    price: 3.0,
    unit: ProductUnit.Dozen,
    category: ProductCategory.DairyAndEggs,
    cells: ['available', 'available', 'available'],
  },
  {
    name: 'Free-range eggs',
    meta: 'Dozen · eggs',
    price: 5.5,
    unit: ProductUnit.Dozen,
    category: ProductCategory.DairyAndEggs,
    cells: ['sold-out', 'sold-out', 'available'],
  },
  {
    name: 'Cavolo nero',
    meta: 'Bunch · vegetables',
    price: 3.0,
    unit: ProductUnit.Bunch,
    category: ProductCategory.Vegetable,
    cells: ['available', null, null],
  },
  {
    name: 'Rhubarb & ginger jam',
    meta: '220g jar · preserves',
    price: 6.5,
    description: 'Made in the polytunnel kitchen from our own rhubarb.',
    unit: ProductUnit.Jar,
    category: ProductCategory.HoneyAndPreserves,
    cells: ['available', 'available', null],
  },
  {
    name: 'New potatoes',
    meta: '2kg · vegetables',
    price: 5.0,
    unit: ProductUnit.Kilogram,
    category: ProductCategory.Vegetable,
    hidden: true,
    cells: [null, null, null],
  },
  {
    name: 'Cherry tomatoes',
    meta: 'Punnet · vegetables',
    price: 3.5,
    unit: ProductUnit.Box,
    category: ProductCategory.Vegetable,
    cells: ['available', 'sold-out', 'available'],
  },
  {
    name: 'Purple sprouting broccoli',
    meta: 'Bunch · vegetables',
    price: 3.5,
    unit: ProductUnit.Bunch,
    category: ProductCategory.Vegetable,
    cells: ['available', 'available', null],
  },
  {
    name: 'Salad leaves',
    meta: '150g bag · vegetables',
    price: 3.0,
    unit: ProductUnit.Bag,
    category: ProductCategory.Vegetable,
    cells: ['available', 'available', 'available'],
  },
  {
    name: 'Baby leeks',
    meta: 'Bunch · vegetables',
    price: 3.0,
    unit: ProductUnit.Bunch,
    category: ProductCategory.Vegetable,
    cells: ['available', null, 'available'],
  },
  {
    name: 'Duck eggs',
    meta: 'Half dozen · eggs',
    price: 4.5,
    unit: ProductUnit.Dozen,
    category: ProductCategory.DairyAndEggs,
    cells: ['available', null, null],
  },
  {
    name: 'Gooseberry jam',
    meta: '220g jar · preserves',
    price: 6.5,
    unit: ProductUnit.Jar,
    category: ProductCategory.HoneyAndPreserves,
    cells: ['available', 'available', 'available'],
  },
  {
    name: 'Wild garlic pesto',
    meta: '180g jar · preserves',
    price: 7.0,
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
    price: seed.price,
    description: seed.description ?? '',
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
    price: 25.0,
    unit: ProductUnit.Box,
    category: ProductCategory.Pantry,
  },
  {
    name: 'House loaf',
    meta: 'Each · baked goods',
    price: 4.5,
    unit: ProductUnit.Each,
    category: ProductCategory.BakedGoods,
  },
  {
    name: 'Table jar',
    meta: '220g jar · preserves',
    price: 6.0,
    unit: ProductUnit.Jar,
    category: ProductCategory.HoneyAndPreserves,
  },
  {
    name: 'Market bunch',
    meta: 'Bunch · herbs',
    price: 3.0,
    unit: ProductUnit.Bunch,
    category: ProductCategory.Herbs,
  },
  {
    name: 'Half kilo bag',
    meta: '500g · pantry',
    price: 5.0,
    unit: ProductUnit.Gram,
    category: ProductCategory.Pantry,
  },
  {
    name: 'Weekend special',
    meta: 'Each · other',
    price: 8.0,
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
 * The four lines design 4a prints under "Recent changes", against the product
 * it prints them for. Everything else starts with the one entry that is true of
 * any seeded row, and grows as the console writes to it.
 */
const SEEDED_LOG: Readonly<Record<string, readonly ProductChange[]>> = {
  'prd-1-rhubarb-500g': [
    { what: 'Marked sold out at Temple Bar by Tom McNally', when: 'Today 11:20' },
    {
      what: 'Marked available at Temple Bar and Marlay Park by Tom McNally',
      when: 'Today 07:04',
    },
    { what: 'Price changed from €3.50 to €4.00', when: '12 Jun' },
    { what: 'Added to Marlay Park Market', when: '3 May' },
  ],
};

function euro(amount: number): string {
  return `€${amount.toFixed(2)}`;
}

/**
 * What changed between the stored product and the draft, in the design's voice
 * — one line per thing an admin would recognise having done. Listings first,
 * because that is what the form is mostly used to change.
 */
function describeUpdate(
  before: VendorProduct,
  draft: ProductDraft,
  markets: readonly ProductMarket[],
): ProductChange[] {
  const label = (slug: string) => markets.find((m) => m.slug === slug)?.label ?? slug;
  const changes: ProductChange[] = [];

  const added = markets
    .filter((m) => m.slug in draft.listings && !(m.slug in before.listings))
    .map((m) => m.label);
  const dropped = markets
    .filter((m) => !(m.slug in draft.listings) && m.slug in before.listings)
    .map((m) => m.label);
  if (added.length) changes.push({ what: `Added to ${sentenceList(added)}`, when: 'Just now' });
  if (dropped.length)
    changes.push({ what: `Removed from ${sentenceList(dropped)}`, when: 'Just now' });

  for (const [slug, status] of Object.entries(draft.listings)) {
    if (!(slug in before.listings) || before.listings[slug] === status) continue;
    changes.push({
      what: `Marked ${status === 'sold-out' ? 'sold out' : 'available'} at ${label(slug)}`,
      when: 'Just now',
    });
  }

  if (before.price !== draft.price) {
    changes.push({
      what: `Price changed from ${euro(before.price)} to ${euro(draft.price)}`,
      when: 'Just now',
    });
  }
  if (
    before.name !== draft.name ||
    before.unit !== draft.unit ||
    before.category !== draft.category ||
    before.description !== draft.description ||
    before.imageUrl !== draft.imageUrl
  ) {
    changes.push({ what: 'Product details updated', when: 'Just now' });
  }

  return changes;
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

  /**
   * "Recent changes" per product, keyed by `vendorSlug::productId`. Seeded from
   * {@link SEEDED_LOG} and appended to by every write, so the log design 4a
   * shows under a product is the same list the console just wrote to.
   */
  private readonly logs = new Map<string, readonly ProductChange[]>();

  /**
   * Real vendor names by slug, set by {@link primeBoard} when
   * `GraphqlProductRepository` hands over a board it read from the API — the
   * directory fixture has no row for a vendor that only exists server-side.
   */
  private readonly names = new Map<string, string>();

  /** Ids handed out this session, so a second "Save and add another" is unique. */
  private nextId = 1;

  /** True once this vendor's board has been built or {@link primeBoard}d. */
  hasBoard(vendorSlug: string): boolean {
    return this.boards.has(vendorSlug);
  }

  /**
   * Seeds a vendor's board from outside — `GraphqlProductRepository` hands over
   * what it read from the API so the session's writes have a real board to run
   * against. `vendorName` fills {@link form}'s breadcrumb.
   */
  primeBoard(vendorSlug: string, board: VendorProductBoard, vendorName?: string): void {
    this.boards.set(vendorSlug, board);
    if (vendorName) this.names.set(vendorSlug, vendorName);
  }

  /** The board as it stands right now, without the {@link board} round-trip delay. */
  snapshot(vendorSlug: string): VendorProductBoard | undefined {
    return this.boards.get(vendorSlug);
  }

  /** Folds one product into the board — replace by id, or prepend a new row. */
  upsertProduct(vendorSlug: string, product: VendorProduct): void {
    const board = this.boards.get(vendorSlug);
    if (!board) return;
    const known = board.products.some((row) => row.id === product.id);
    const products = known
      ? board.products.map((row) => (row.id === product.id ? product : row))
      : [product, ...board.products];
    this.boards.set(vendorSlug, { ...board, products });
  }

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
    return this.writeOne(
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
    return this.writeOne(
      vendorSlug,
      (product) => (product.id === productId ? { ...product, hidden } : product),
      productId,
    );
  }

  override form(vendorSlug: string, productId: string | null): Observable<ProductForm> {
    const board = this.boards.get(vendorSlug) ?? buildProductBoard(vendorSlug);
    if (!board) {
      return throwError(() => new Error(`No vendor matches “${vendorSlug}”.`)).pipe(delay(300));
    }
    this.boards.set(vendorSlug, board);

    const vendorName =
      this.names.get(vendorSlug) ??
      VENDORS_FIXTURE.find((candidate) => candidate.slug === vendorSlug)?.name ??
      'Vendor';
    if (productId === null) {
      return of({
        vendorSlug,
        vendorName,
        markets: board.markets,
        product: null,
        changes: [],
        savedAt: null,
        lastEditedBy: null,
      }).pipe(delay(300));
    }

    const product = board.products.find((candidate) => candidate.id === productId);
    if (!product) {
      return throwError(
        () => new Error(`${vendorName} does not sell a product with that address.`),
      ).pipe(delay(300));
    }
    const changes = this.logFor(vendorSlug, product.id);
    return of({
      vendorSlug,
      vendorName,
      markets: board.markets,
      product,
      changes,
      savedAt: '4 minutes ago',
      lastEditedBy: changes.length ? `Tom McNally · ${changes[0]!.when.toLowerCase()}` : null,
    }).pipe(delay(300));
  }

  override create(vendorSlug: string, draft: ProductDraft): Observable<VendorProduct> {
    const board = this.boards.get(vendorSlug);
    if (!board) return this.gone();

    const meta = productMeta(draft.unit, draft.category);
    const product: VendorProduct = {
      id: `prd-new-${this.nextId++}-${slugifyName(draft.name, meta)}`,
      name: draft.name,
      meta,
      unit: draft.unit,
      category: draft.category,
      price: draft.price,
      description: draft.description,
      imageUrl: draft.imageUrl,
      hidden: false,
      listings: { ...draft.listings },
    };
    this.boards.set(vendorSlug, { ...board, products: [product, ...board.products] });

    const where = board.markets
      .filter((market) => market.slug in draft.listings)
      .map((market) => market.label);
    this.logs.set(this.key(vendorSlug, product.id), [
      {
        what: where.length
          ? `Added, carried at ${sentenceList(where)}`
          : 'Added, not carried anywhere yet',
        when: 'Just now',
      },
    ]);
    return of(product).pipe(delay(200));
  }

  override update(
    vendorSlug: string,
    productId: string,
    draft: ProductDraft,
  ): Observable<VendorProduct> {
    const board = this.boards.get(vendorSlug);
    if (!board) return this.gone();
    const before = board.products.find((candidate) => candidate.id === productId);
    if (!before) return this.gone();

    const after: VendorProduct = {
      ...before,
      name: draft.name,
      meta: productMeta(draft.unit, draft.category),
      unit: draft.unit,
      category: draft.category,
      price: draft.price,
      description: draft.description,
      imageUrl: draft.imageUrl,
      listings: { ...draft.listings },
    };
    this.boards.set(vendorSlug, {
      ...board,
      products: board.products.map((row) => (row.id === productId ? after : row)),
    });

    const written = describeUpdate(before, draft, board.markets);
    if (written.length) {
      this.logs.set(this.key(vendorSlug, productId), [
        ...written,
        ...this.logFor(vendorSlug, productId),
      ]);
    }
    return of(after).pipe(delay(200));
  }

  override remove(vendorSlug: string, productId: string): Observable<void> {
    const board = this.boards.get(vendorSlug);
    if (!board) return this.gone();
    if (!board.products.some((candidate) => candidate.id === productId)) return this.gone();

    this.boards.set(vendorSlug, {
      ...board,
      products: board.products.filter((row) => row.id !== productId),
    });
    this.logs.delete(this.key(vendorSlug, productId));
    return of(undefined).pipe(delay(200));
  }

  /** The stored log, falling back to what the fixture seeds the product with. */
  private logFor(vendorSlug: string, productId: string): readonly ProductChange[] {
    return this.logs.get(this.key(vendorSlug, productId)) ?? SEEDED_LOG[productId] ?? [];
  }

  private key(vendorSlug: string, productId: string): string {
    return `${vendorSlug}::${productId}`;
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
  private writeOne(
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
