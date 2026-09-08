import { Observable } from 'rxjs';

/** What an upload gives back — the URL is the only part the domain stores. */
export interface UploadedImage {
  readonly url: string;
  readonly fileName: string;
  readonly sizeBytes: number;
}

/**
 * Which presigned-upload mutation to ask for. The backend has five distinct
 * ones (`createMarketImageUploadUrl`, `createMarketBannerUploadUrl`,
 * `createVendorImageUploadUrl`, `createProductImageUploadUrl`,
 * `createAvatarUploadUrl`) — this is how a caller picks between them.
 */
export type MediaKind =
  'market-image' | 'market-banner' | 'vendor-image' | 'product-image' | 'avatar';

/**
 * Port for binary uploads. Declared as an abstract class so it doubles as its
 * own DI token while staying a checkable type — see `api.providers.ts`.
 */
export abstract class MediaRepository {
  /**
   * `vendorId` is read for `'product-image'` and `'vendor-image'`, and is
   * required for both: those two presigns sign a key under the vendor's own
   * prefix, and an admin holds no seat the backend could resolve one from.
   * See `graphql/operations/media.ts`.
   */
  abstract upload(file: File, kind: MediaKind, vendorId?: string): Observable<UploadedImage>;
}
