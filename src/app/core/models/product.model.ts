/**
 * What a product is sold as. Mirrors the backend's `ProductUnit`
 * (`../backend/src/products/enums/product-unit.enum.ts`, exposed as the
 * `ProductUnit` GraphQL enum).
 */
export enum ProductUnit {
  Bag = 'BAG',
  Box = 'BOX',
  Bunch = 'BUNCH',
  Dozen = 'DOZEN',
  Each = 'EACH',
  Gram = 'G',
  Jar = 'JAR',
  Kilogram = 'KG',
  Pound = 'LB',
  Liter = 'LITER',
  Milliliter = 'ML',
  Ounce = 'OZ',
  Pint = 'PINT',
  Quart = 'QUART',
}

/** The shelf a product sits on. Mirrors the backend's `ProductCategory`. */
export enum ProductCategory {
  BakedGoods = 'BAKED_GOODS',
  Beverages = 'BEVERAGES',
  DairyAndEggs = 'DAIRY_AND_EGGS',
  Flowers = 'FLOWERS',
  Fruit = 'FRUIT',
  Herbs = 'HERBS',
  HoneyAndPreserves = 'HONEY_AND_PRESERVES',
  Meat = 'MEAT',
  Other = 'OTHER',
  Pantry = 'PANTRY',
  Seafood = 'SEAFOOD',
  Vegetable = 'VEGETABLE',
}

/** How each category reads in the console's "All categories" menu. */
export const PRODUCT_CATEGORY_LABELS: Record<ProductCategory, string> = {
  [ProductCategory.BakedGoods]: 'Baked goods',
  [ProductCategory.Beverages]: 'Beverages',
  [ProductCategory.DairyAndEggs]: 'Dairy & eggs',
  [ProductCategory.Flowers]: 'Flowers',
  [ProductCategory.Fruit]: 'Fruit',
  [ProductCategory.Herbs]: 'Herbs',
  [ProductCategory.HoneyAndPreserves]: 'Honey & preserves',
  [ProductCategory.Meat]: 'Meat',
  [ProductCategory.Other]: 'Other',
  [ProductCategory.Pantry]: 'Pantry',
  [ProductCategory.Seafood]: 'Seafood',
  [ProductCategory.Vegetable]: 'Vegetables',
};

/**
 * The only two states a listing has (design 3a). There is deliberately no
 * third: a product the vendor does not bring to a market has no listing there
 * at all, and nothing anywhere records *how many* are left — vendors keep this
 * from their phone at the stall, so the app never asks for a number it cannot
 * keep accurate.
 */
export type ListingStatus = 'available' | 'sold-out';

/**
 * One column of the products grid — a market this vendor trades at. Built from
 * the vendor's memberships, so the columns can never name a market the Markets
 * tab doesn't.
 */
export interface ProductMarket {
  /** Links a column through to the market's own screens. */
  slug: string;
  /** Short label — "Temple Bar". */
  label: string;
  /** "Stall A7", or "Paused" while the membership is. */
  note: string;
  /** Nothing on this market's shopper view, whatever the listings say. */
  paused: boolean;
}

/**
 * One product a vendor sells, with its status at each market it is carried at
 * (design 3a).
 *
 * `meta` is the display line the design writes ("Half dozen · eggs") while
 * `unit` and `category` are the structured values behind it — the filter reads
 * the latter, the row renders the former, and the GraphQL swap has both.
 */
export interface VendorProduct {
  id: string;
  name: string;
  /** "Bunch · vegetables". */
  meta: string;
  unit: ProductUnit;
  category: ProductCategory;
  /** The product photo, or `null` for a tinted placeholder. */
  imageUrl: string | null;
  /** Off the shopper's view everywhere, whatever the per-market statuses say. */
  hidden: boolean;
  /**
   * Status by market slug. A market that is absent is one this product is not
   * carried at — that is the whole meaning of the missing key, which is why
   * this is a sparse map rather than a status-per-column array.
   */
  listings: Readonly<Record<string, ListingStatus>>;
}

/** The last thing that happened to this list, from wherever it happened. */
export interface ProductChange {
  /** "Bríd McNally marked Rhubarb sold out at Temple Bar". */
  what: string;
  /** "Today 11:20, from the vendor app". */
  when: string;
}

/** Everything the Products tab loads in one call. */
export interface VendorProductBoard {
  vendorSlug: string;
  markets: readonly ProductMarket[];
  products: readonly VendorProduct[];
  lastChange: ProductChange | null;
}

/** The chip row above the grid. Exactly one is on at a time. */
export type ProductView = 'all' | 'soldOut' | 'hidden' | 'partial';

export const PRODUCT_VIEWS: readonly { value: ProductView; label: string }[] = [
  { value: 'all', label: 'All products' },
  { value: 'soldOut', label: 'Sold out somewhere' },
  { value: 'hidden', label: 'Hidden from shoppers' },
  { value: 'partial', label: 'Not carried everywhere' },
];

/** Products filters. Each one is a query param (§7). */
export interface ProductFilters {
  q: string;
  category: ProductCategory | null;
  view: ProductView;
}

export const EMPTY_PRODUCT_FILTERS: ProductFilters = {
  q: '',
  category: null,
  view: 'all',
};

/** One market's line in the "Mark everything sold out" rail. */
export interface MarketStock {
  market: ProductMarket;
  /** Products carried at this market — the denominator. */
  carried: number;
  available: number;
  /** "11 of 12 carried products available", or why there is nothing to say. */
  state: string;
}

/** One entry in the "Sold out right now" rail. */
export interface SoldOutEntry {
  product: VendorProduct;
  /** Market slugs it is sold out at — what "Restock" puts back. */
  marketSlugs: readonly string[];
  /** "Temple Bar and Marlay Park". */
  where: string;
}
