import { gql } from '../gql-tag';

/**
 * Every presign mutation returns the same three fields, but as five distinct
 * GraphQL object types (`AvatarUploadUrlModel`, `MarketImageUploadUrlModel`, …)
 * with no shared interface in the schema — so each selection is written out
 * rather than shared through one fragment, which GraphQL would reject on a
 * type it doesn't apply to.
 */
export const CREATE_MARKET_IMAGE_UPLOAD_URL = gql`
  mutation CreateMarketImageUploadUrl($mimeType: String!) {
    createMarketImageUploadUrl(mimeType: $mimeType) {
      key
      publicUrl
      uploadUrl
    }
  }
`;

export const CREATE_MARKET_BANNER_UPLOAD_URL = gql`
  mutation CreateMarketBannerUploadUrl($mimeType: String!) {
    createMarketBannerUploadUrl(mimeType: $mimeType) {
      key
      publicUrl
      uploadUrl
    }
  }
`;

/**
 * Keyed by the vendor for the same reason the product presign is: it signs a
 * `vendors/<vendorId>/…` key, and an admin holds no seat the resolver could
 * infer one from. A vendor caller's own seat wins and this argument is ignored.
 */
export const CREATE_VENDOR_IMAGE_UPLOAD_URL = gql`
  mutation CreateVendorImageUploadUrl($mimeType: String!, $vendorId: ID) {
    createVendorImageUploadUrl(mimeType: $mimeType, vendorId: $vendorId) {
      key
      publicUrl
      uploadUrl
    }
  }
`;

/**
 * The one presign that is not `mimeType` alone. Server-side it resolves the
 * vendor from the caller's own seat, and an admin has none — without
 * `vendorId` it answers `Specify the vendor this product belongs to.`
 * (`../backend/src/products/products.resolver.ts` → `writeVendorId`), which is
 * every admin upload. The key it signs is `products/<vendorId>/…`, so this is
 * also what puts the photo in the right vendor's folder.
 */
export const CREATE_PRODUCT_IMAGE_UPLOAD_URL = gql`
  mutation CreateProductImageUploadUrl($mimeType: String!, $vendorId: ID) {
    createProductImageUploadUrl(mimeType: $mimeType, vendorId: $vendorId) {
      key
      publicUrl
      uploadUrl
    }
  }
`;

export const CREATE_AVATAR_UPLOAD_URL = gql`
  mutation CreateAvatarUploadUrl($mimeType: String!) {
    createAvatarUploadUrl(mimeType: $mimeType) {
      key
      publicUrl
      uploadUrl
    }
  }
`;
