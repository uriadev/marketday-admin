import {
  ListingStatus,
  ProductCategory,
  ProductDraft,
  ProductMarket,
  ProductUnit,
  VendorProduct,
  VendorProductBoard,
  productMeta,
} from '../../../models/product.model';
import {
  CreateProductInput,
  ProductCategory as GqlProductCategory,
  ProductFieldsFragment,
  ProductUnit as GqlProductUnit,
  UpdateProductInput,
  VendorProductsQuery,
} from '../generated';

/**
 * Ties every read to the schema via codegen — a field renamed on `ProductModel`
 * or `VendorModel` in `schema.gql` breaks `pnpm gql:generate`, which breaks
 * this file at compile time. See `operations/product.ts`.
 */
export type GqlVendorForProducts = NonNullable<VendorProductsQuery['vendor']>;
type GqlMarket = GqlVendorForProducts['markets'][number];

/**
 * The console's own `ProductUnit` / `ProductCategory` (`core/models/`) and the
 * generated, schema-derived ones are separate TypeScript enums over the same
 * string values, so a cast is the whole conversion — the same move
 * `market-mapper.ts` makes for `MarketType`. `category` is nullable on
 * `ProductModel`; a product with none reads as "Other".
 */
const toUnit = (unit: GqlProductUnit): ProductUnit => unit as unknown as ProductUnit;
const toCategory = (category: GqlProductCategory | null): ProductCategory =>
  (category as unknown as ProductCategory | null) ?? ProductCategory.Other;

/**
 * `active + accepting orders → trading`; anything else pauses every column —
 * there is no per-market pause signal server-side, the same narrowing
 * `vendor-mapper.ts` makes.
 */
export function vendorPaused(
  vendor: Pick<GqlVendorForProducts, 'isActive' | 'isAcceptingOrders'>,
): boolean {
  return !(vendor.isActive && vendor.isAcceptingOrders);
}

/** market id → market slug (the grid's column key). */
function marketSlugById(vendor: GqlVendorForProducts): Map<string, string> {
  return new Map(vendor.markets.map((market) => [market.id, market.slug]));
}

/** market slug → market id, for the `setProductListing` / `removeProductListing` writes. */
export function marketIdBySlug(vendor: GqlVendorForProducts): Map<string, string> {
  return new Map(vendor.markets.map((market) => [market.slug, market.id]));
}

function toMarket(market: GqlMarket, paused: boolean): ProductMarket {
  return {
    slug: market.slug,
    label: market.name,
    // No stall/pitch model server-side (`docs/backend-api-gaps.md` #4) — the
    // header carries the market's town rather than a stall number.
    note: paused ? 'Paused' : market.city,
    paused,
  };
}

/**
 * One `ProductModel` → one grid row. `listings` is keyed by market *slug*,
 * resolved through `slugById` since `ProductListingModel` carries only
 * `marketId`; a market absent from the map is one the product is not carried
 * at. `hidden` is the global `isAvailable` inverted — what `toggleProduct`
 * flips, off every market's shopper view at once.
 */
export function toVendorProduct(
  product: ProductFieldsFragment,
  slugById: ReadonlyMap<string, string>,
): VendorProduct {
  const unit = toUnit(product.unit);
  const category = toCategory(product.category);
  const listings: Record<string, ListingStatus> = {};
  for (const listing of product.listings) {
    const slug = slugById.get(listing.marketId);
    if (slug) listings[slug] = listing.isAvailable ? 'available' : 'sold-out';
  }
  return {
    id: product.id,
    name: product.name,
    meta: productMeta(unit, category),
    unit,
    category,
    price: product.price,
    description: product.description ?? '',
    imageUrl: product.imageUrl ?? null,
    hidden: !product.isAvailable,
    listings,
  };
}

/**
 * The Products tab's whole payload (design 3a) from one `VendorProducts` read.
 * `lastChange` has no backend source — no product audit log
 * (`docs/backend-api-gaps.md` #6) — so it opens `null` and fills only once the
 * console itself writes to the grid this session.
 */
export function toVendorProductBoard(data: VendorProductsQuery): VendorProductBoard {
  const vendor = data.vendor;
  if (!vendor) throw new Error('That vendor could not be found.');
  const paused = vendorPaused(vendor);
  const slugById = marketSlugById(vendor);
  return {
    vendorSlug: vendor.slug,
    markets: vendor.markets.map((market) => toMarket(market, paused)),
    products: data.products.items.map((product) => toVendorProduct(product, slugById)),
    lastChange: null,
  };
}

/**
 * The product form's fields (design 4a) → `CreateProductInput` /
 * `UpdateProductInput`. "Where it is sold" is not on either — it is a set of
 * `setProductListing` / `removeProductListing` calls the adapter makes beside
 * the `create` / `update` (`GraphqlProductRepository`).
 */
export function toProductInput(draft: ProductDraft): CreateProductInput & UpdateProductInput {
  return {
    name: draft.name,
    category: draft.category as unknown as GqlProductCategory,
    unit: draft.unit as unknown as GqlProductUnit,
    price: draft.price,
    description: draft.description || null,
    imageUrl: draft.imageUrl,
  };
}
