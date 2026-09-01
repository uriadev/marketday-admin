import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { MediaKind, MediaRepository, UploadedImage } from '../ports/media-repository';
import { GraphqlClient } from './graphql-client';
import {
  CREATE_AVATAR_UPLOAD_URL,
  CREATE_MARKET_BANNER_UPLOAD_URL,
  CREATE_MARKET_IMAGE_UPLOAD_URL,
  CREATE_PRODUCT_IMAGE_UPLOAD_URL,
  CREATE_VENDOR_IMAGE_UPLOAD_URL,
} from './operations/media';
import {
  CreateAvatarUploadUrlMutation,
  CreateAvatarUploadUrlMutationVariables,
  CreateMarketBannerUploadUrlMutation,
  CreateMarketBannerUploadUrlMutationVariables,
  CreateMarketImageUploadUrlMutation,
  CreateMarketImageUploadUrlMutationVariables,
  CreateProductImageUploadUrlMutation,
  CreateProductImageUploadUrlMutationVariables,
  CreateVendorImageUploadUrlMutation,
  CreateVendorImageUploadUrlMutationVariables,
} from './generated';

/**
 * The `{ key, publicUrl, uploadUrl }` shape every presign mutation returns.
 * `__typename` is omitted: it differs per mutation (`AvatarUploadUrlModel`
 * vs `MarketImageUploadUrlModel`, …), which the RxJS pipeline below would
 * otherwise reject as five incompatible `Observable` types.
 */
type UploadUrlResult = Omit<CreateAvatarUploadUrlMutation['createAvatarUploadUrl'], '__typename'>;

/**
 * Presign, then `PUT` the file straight to R2/LocalStack — never through the
 * API, never through the dev proxy. `../backend/src/storage/storage.service.ts`
 * signs the URL with an exact `Content-Type` and `x-amz-acl: public-read`
 * baked in, and it **expires in 300s**, so this must set `Content-Type` to
 * the same `mimeType` it presigned and send nothing else — no `Authorization`,
 * no `x-api-key`, both of which `authInterceptor` already withholds because
 * this URL is never `environment.api.graphqlUrl`. The bucket needs its own
 * CORS policy allowing `PUT` from this origin — see
 * `docs/backend-api-gaps.md` #12; check `infra/localstack/init-s3.sh` in dev.
 */
@Injectable()
export class GraphqlMediaRepository extends MediaRepository {
  private readonly client = inject(GraphqlClient);
  private readonly http = inject(HttpClient);

  override upload(file: File, kind: MediaKind): Observable<UploadedImage> {
    return this.presign(file, kind).pipe(
      switchMap((presigned) =>
        this.http
          .put(presigned.uploadUrl, file, {
            headers: { 'Content-Type': file.type, 'x-amz-acl': 'public-read' },
          })
          .pipe(map(() => presigned)),
      ),
      map((presigned) => ({ url: presigned.publicUrl, fileName: file.name, sizeBytes: file.size })),
    );
  }

  /** Five distinct mutations, five distinct result types — schema.gql has no shared interface. */
  private presign(file: File, kind: MediaKind): Observable<UploadUrlResult> {
    const mimeType = file.type;
    switch (kind) {
      case 'market-image':
        return this.client
          .request<CreateMarketImageUploadUrlMutation, CreateMarketImageUploadUrlMutationVariables>(
            CREATE_MARKET_IMAGE_UPLOAD_URL,
            { mimeType },
          )
          .pipe(map((r): UploadUrlResult => r.createMarketImageUploadUrl));
      case 'market-banner':
        return this.client
          .request<
            CreateMarketBannerUploadUrlMutation,
            CreateMarketBannerUploadUrlMutationVariables
          >(CREATE_MARKET_BANNER_UPLOAD_URL, { mimeType })
          .pipe(map((r): UploadUrlResult => r.createMarketBannerUploadUrl));
      case 'vendor-image':
        return this.client
          .request<CreateVendorImageUploadUrlMutation, CreateVendorImageUploadUrlMutationVariables>(
            CREATE_VENDOR_IMAGE_UPLOAD_URL,
            { mimeType },
          )
          .pipe(map((r): UploadUrlResult => r.createVendorImageUploadUrl));
      case 'product-image':
        return this.client
          .request<
            CreateProductImageUploadUrlMutation,
            CreateProductImageUploadUrlMutationVariables
          >(CREATE_PRODUCT_IMAGE_UPLOAD_URL, { mimeType })
          .pipe(map((r): UploadUrlResult => r.createProductImageUploadUrl));
      case 'avatar':
        return this.client
          .request<CreateAvatarUploadUrlMutation, CreateAvatarUploadUrlMutationVariables>(
            CREATE_AVATAR_UPLOAD_URL,
            { mimeType },
          )
          .pipe(map((r): UploadUrlResult => r.createAvatarUploadUrl));
    }
  }
}
