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

export const CREATE_VENDOR_IMAGE_UPLOAD_URL = gql`
  mutation CreateVendorImageUploadUrl($mimeType: String!) {
    createVendorImageUploadUrl(mimeType: $mimeType) {
      key
      publicUrl
      uploadUrl
    }
  }
`;

export const CREATE_PRODUCT_IMAGE_UPLOAD_URL = gql`
  mutation CreateProductImageUploadUrl($mimeType: String!) {
    createProductImageUploadUrl(mimeType: $mimeType) {
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
