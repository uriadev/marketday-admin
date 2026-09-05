import { gql } from '../gql-tag';

/**
 * Every field `product-mapper.ts` reads off a `ProductModel`, in one fragment
 * so the read and the write documents below can't drift. `ProductListingModel`
 * carries only `marketId` — the console keys the grid by market *slug*, so the
 * `VendorProducts` read pairs this with the vendor's `markets` to translate.
 */
const PRODUCT_FIELDS = gql`
  fragment ProductFields on ProductModel {
    id
    name
    category
    unit
    price
    description
    imageUrl
    isAvailable
    listings {
      marketId
      isAvailable
    }
  }
`;

/**
 * The products grid (design 3a) in one round trip: the vendor's markets — the
 * grid's columns — and every product they sell. Both root fields are
 * `@Public()` server-side (`../backend/src/products/products.resolver.ts`,
 * `../backend/src/vendors/vendors.resolver.ts`), so the read needs only the
 * `x-api-key` every request carries.
 *
 * `criteria: { limit: … }` lifts `ProductsService.DEFAULT_LIMIT` (a silent
 * `take(20)` when no `criteria` is passed) so a whole stall's list comes back.
 */
export const VENDOR_PRODUCTS = gql`
  ${PRODUCT_FIELDS}
  query VendorProducts($vendorId: ID!, $criteria: CriteriaInput) {
    vendor(id: $vendorId) {
      id
      slug
      name
      isActive
      isAcceptingOrders
      markets {
        id
        slug
        name
        city
      }
    }
    products(vendorId: $vendorId, criteria: $criteria) {
      totalCount
      items {
        ...ProductFields
      }
    }
  }
`;

/**
 * Slug → id for the grid: the console routes vendors by slug, and neither
 * `vendor` nor `products` nor `createProduct` takes one. `@Roles(ADMIN)`.
 */
export const ADMIN_VENDOR_IDS = gql`
  query AdminVendorIds {
    adminVendors {
      items {
        id
        slug
      }
    }
  }
`;

/**
 * `createProduct` / `updateProduct` / `toggleProduct` are `@Roles(VENDOR,
 * ADMIN)` in `../backend`; an admin passes `vendorId` (or it is taken from the
 * product) instead of a seat. `setProductListing` / `removeProductListing` are
 * the per-market writes the grid's cell flips and "whole market" commands fan
 * out to. There is no `deleteProduct` (`docs/backend-api-gaps.md` #8).
 */
export const CREATE_PRODUCT = gql`
  ${PRODUCT_FIELDS}
  mutation CreateProduct($vendorId: ID!, $input: CreateProductInput!) {
    createProduct(vendorId: $vendorId, input: $input) {
      ...ProductFields
    }
  }
`;

export const UPDATE_PRODUCT = gql`
  ${PRODUCT_FIELDS}
  mutation UpdateProduct($id: ID!, $input: UpdateProductInput!) {
    updateProduct(id: $id, input: $input) {
      ...ProductFields
    }
  }
`;

export const TOGGLE_PRODUCT = gql`
  ${PRODUCT_FIELDS}
  mutation ToggleProduct($id: ID!) {
    toggleProduct(id: $id) {
      ...ProductFields
    }
  }
`;

export const SET_PRODUCT_LISTING = gql`
  mutation SetProductListing($input: SetProductListingInput!) {
    setProductListing(input: $input) {
      id
      productId
      marketId
      isAvailable
    }
  }
`;

export const REMOVE_PRODUCT_LISTING = gql`
  mutation RemoveProductListing($productId: ID!, $marketId: ID!) {
    removeProductListing(productId: $productId, marketId: $marketId)
  }
`;
