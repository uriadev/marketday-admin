import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { ProductRepository } from '../ports/product-repository';
import {
  ListingStatus,
  ProductDraft,
  ProductForm,
  VendorProduct,
  VendorProductBoard,
} from '../../models/product.model';
import { InMemoryProductRepository } from '../in-memory/in-memory-product-repository';
import { GraphqlClient } from './graphql-client';
import {
  ADMIN_VENDOR_IDS,
  CREATE_PRODUCT,
  REMOVE_PRODUCT_LISTING,
  SET_PRODUCT_LISTING,
  TOGGLE_PRODUCT,
  UPDATE_PRODUCT,
  VENDOR_PRODUCTS,
} from './operations/product';
import {
  marketIdBySlug,
  toProductInput,
  toVendorProduct,
  toVendorProductBoard,
} from './mappers/product-mapper';
import {
  AdminVendorIdsQuery,
  AdminVendorIdsQueryVariables,
  CreateProductMutation,
  CreateProductMutationVariables,
  ProductFieldsFragment,
  RemoveProductListingMutation,
  RemoveProductListingMutationVariables,
  SetProductListingMutation,
  SetProductListingMutationVariables,
  ToggleProductMutation,
  ToggleProductMutationVariables,
  UpdateProductMutation,
  UpdateProductMutationVariables,
  VendorProductsQuery,
  VendorProductsQueryVariables,
} from './generated';

/** Well past any vendor's catalogue size, to clear `ProductsService.DEFAULT_LIMIT`. */
const PRODUCT_LIMIT = 500;

/**
 * The Products tab (design 3a) against the real API.
 *
 * The read is `vendor(id)` + `products(vendorId:)` in one round trip, both
 * `@Public()` server-side. The writes are the vendor product mutations, widened
 * to `@Roles(VENDOR, ADMIN)` in `../backend` so an admin acts for any vendor
 * without a seat: `setProductListing` (one cell, and every carried cell for the
 * two "whole market" commands), `toggleProduct` (hide / show), `createProduct`
 * + `updateProduct` for the form. There is still no `deleteProduct`
 * (`docs/backend-api-gaps.md` #8), so {@link remove} unlists the product at
 * every market and hides it — the nearest thing to gone the schema allows.
 *
 * A private, unshared `InMemoryProductRepository`, primed from the real read on
 * first access per vendor, holds the board between calls: the port hands back
 * reconstructed `VendorProduct` shapes (one flipped cell, the whole list after
 * a market command) and the fixture already builds them. `lastChange` and the
 * form's "Recent changes" / "saved N minutes ago" have no backend source (#6)
 * and stay empty, or fill from this session's own writes.
 *
 * The two "whole market" commands and a form save fan out to one
 * `setProductListing` / `removeProductListing` per cell — there is no
 * transaction, so a mid-flight failure can leave the server partly changed; the
 * grid re-syncs on its next load.
 */
@Injectable()
export class GraphqlProductRepository extends ProductRepository {
  private readonly client = inject(GraphqlClient);
  /** Session-local board state and return-value reconstruction — see the class doc. */
  private readonly fixture = new InMemoryProductRepository();

  /** Vendor slug → id; `vendor` / `products` / `createProduct` are all ID-keyed. */
  private readonly idBySlug = new Map<string, string>();
  /** Per vendor slug: market slug → market id, for the listing mutations. */
  private readonly marketIds = new Map<string, Map<string, string>>();

  override board(vendorSlug: string): Observable<VendorProductBoard> {
    // Straight from the primed board — no second `delay()` on top of the read.
    return this.primed(vendorSlug).pipe(map(() => this.snapshot(vendorSlug)));
  }

  override form(vendorSlug: string, productId: string | null): Observable<ProductForm> {
    return this.primed(vendorSlug).pipe(switchMap(() => this.fixture.form(vendorSlug, productId)));
  }

  override setStatus(
    vendorSlug: string,
    productId: string,
    marketSlug: string,
    status: ListingStatus,
  ): Observable<VendorProduct> {
    return this.primed(vendorSlug).pipe(
      switchMap(() => this.setListing(vendorSlug, productId, marketSlug, status === 'available')),
      switchMap(() => this.fixture.setStatus(vendorSlug, productId, marketSlug, status)),
    );
  }

  override markMarketSoldOut(
    vendorSlug: string,
    marketSlug: string,
  ): Observable<readonly VendorProduct[]> {
    return this.primed(vendorSlug).pipe(
      switchMap(() => {
        const carried = this.snapshot(vendorSlug).products.filter(
          (product) => marketSlug in product.listings,
        );
        return this.all(
          carried.map((product) => this.setListing(vendorSlug, product.id, marketSlug, false)),
        );
      }),
      switchMap(() => this.fixture.markMarketSoldOut(vendorSlug, marketSlug)),
    );
  }

  override resetSoldOut(vendorSlug: string): Observable<readonly VendorProduct[]> {
    return this.primed(vendorSlug).pipe(
      switchMap(() => {
        const writes = this.snapshot(vendorSlug).products.flatMap((product) =>
          Object.entries(product.listings)
            .filter(([, listingStatus]) => listingStatus === 'sold-out')
            .map(([slug]) => this.setListing(vendorSlug, product.id, slug, true)),
        );
        return this.all(writes);
      }),
      switchMap(() => this.fixture.resetSoldOut(vendorSlug)),
    );
  }

  override setHidden(
    vendorSlug: string,
    productId: string,
    hidden: boolean,
  ): Observable<VendorProduct> {
    return this.primed(vendorSlug).pipe(
      switchMap(() => {
        const current = this.snapshot(vendorSlug).products.find((row) => row.id === productId);
        // `toggleProduct` flips the flag — only call it when it is actually moving.
        return current && current.hidden !== hidden
          ? this.client.request<ToggleProductMutation, ToggleProductMutationVariables>(
              TOGGLE_PRODUCT,
              { id: productId },
            )
          : of(null);
      }),
      switchMap(() => this.fixture.setHidden(vendorSlug, productId, hidden)),
    );
  }

  override create(vendorSlug: string, draft: ProductDraft): Observable<VendorProduct> {
    return this.primed(vendorSlug).pipe(
      switchMap(() =>
        this.client.request<CreateProductMutation, CreateProductMutationVariables>(CREATE_PRODUCT, {
          vendorId: this.vendorId(vendorSlug),
          input: toProductInput(draft),
        }),
      ),
      switchMap(({ createProduct }) =>
        this.applyListings(vendorSlug, createProduct.id, {}, draft.listings).pipe(
          map(() => this.remember(vendorSlug, createProduct, draft.listings)),
        ),
      ),
    );
  }

  override update(
    vendorSlug: string,
    productId: string,
    draft: ProductDraft,
  ): Observable<VendorProduct> {
    return this.primed(vendorSlug).pipe(
      switchMap(() => {
        const before = this.snapshot(vendorSlug).products.find((row) => row.id === productId);
        return this.client
          .request<UpdateProductMutation, UpdateProductMutationVariables>(UPDATE_PRODUCT, {
            id: productId,
            input: toProductInput(draft),
          })
          .pipe(
            switchMap(({ updateProduct }) =>
              this.applyListings(
                vendorSlug,
                productId,
                before?.listings ?? {},
                draft.listings,
              ).pipe(map(() => this.remember(vendorSlug, updateProduct, draft.listings))),
            ),
          );
      }),
    );
  }

  override remove(vendorSlug: string, productId: string): Observable<void> {
    return this.primed(vendorSlug).pipe(
      switchMap(() => {
        const product = this.snapshot(vendorSlug).products.find((row) => row.id === productId);
        const unlist = Object.keys(product?.listings ?? {}).map((slug) =>
          this.client.request<RemoveProductListingMutation, RemoveProductListingMutationVariables>(
            REMOVE_PRODUCT_LISTING,
            { productId, marketId: this.marketId(vendorSlug, slug) },
          ),
        );
        // No `deleteProduct` (#8): unlisted everywhere and hidden is as gone as
        // it gets — a hard reload would still show it as a "Not carried" row.
        const hide =
          product && !product.hidden
            ? [
                this.client.request<ToggleProductMutation, ToggleProductMutationVariables>(
                  TOGGLE_PRODUCT,
                  { id: productId },
                ),
              ]
            : [];
        return this.all([...unlist, ...hide]);
      }),
      switchMap(() => this.fixture.remove(vendorSlug, productId)),
    );
  }

  /* ── Internals ─────────────────────────────────────────────────────────── */

  /** Fetches the board from GraphQL once per vendor and hands it to the fixture. */
  private primed(vendorSlug: string): Observable<void> {
    if (this.fixture.hasBoard(vendorSlug)) return of(undefined);
    return this.resolveId(vendorSlug).pipe(
      switchMap((vendorId) =>
        this.client.request<VendorProductsQuery, VendorProductsQueryVariables>(VENDOR_PRODUCTS, {
          vendorId,
          criteria: { limit: PRODUCT_LIMIT },
        }),
      ),
      map((data) => {
        if (!data.vendor) throw new Error('That vendor could not be found.');
        this.marketIds.set(vendorSlug, marketIdBySlug(data.vendor));
        this.fixture.primeBoard(vendorSlug, toVendorProductBoard(data), data.vendor.name);
      }),
    );
  }

  /** Refills the slug → id map from `adminVendors` when asked for an unknown slug. */
  private resolveId(slug: string): Observable<string> {
    const known = this.idBySlug.get(slug);
    if (known) return of(known);
    return this.client
      .request<AdminVendorIdsQuery, AdminVendorIdsQueryVariables>(ADMIN_VENDOR_IDS, {})
      .pipe(
        map((result) => {
          for (const vendor of result.adminVendors.items) {
            this.idBySlug.set(vendor.slug, vendor.id);
          }
          const id = this.idBySlug.get(slug);
          if (!id) throw new Error('That vendor could not be found.');
          return id;
        }),
      );
  }

  private vendorId(slug: string): string {
    const id = this.idBySlug.get(slug);
    if (!id) throw new Error('That vendor could not be found.');
    return id;
  }

  private marketId(vendorSlug: string, marketSlug: string): string {
    const id = this.marketIds.get(vendorSlug)?.get(marketSlug);
    if (!id) throw new Error(`That vendor does not trade at “${marketSlug}”.`);
    return id;
  }

  private snapshot(vendorSlug: string): VendorProductBoard {
    const board = this.fixture.snapshot(vendorSlug);
    if (!board) throw new Error('That product list is no longer loaded.');
    return board;
  }

  private setListing(
    vendorSlug: string,
    productId: string,
    marketSlug: string,
    isAvailable: boolean,
  ): Observable<SetProductListingMutation> {
    return this.client.request<SetProductListingMutation, SetProductListingMutationVariables>(
      SET_PRODUCT_LISTING,
      { input: { productId, marketId: this.marketId(vendorSlug, marketSlug), isAvailable } },
    );
  }

  /** The `setProductListing` / `removeProductListing` a saved draft's listings imply. */
  private applyListings(
    vendorSlug: string,
    productId: string,
    before: Readonly<Record<string, ListingStatus>>,
    after: Readonly<Record<string, ListingStatus>>,
  ): Observable<unknown> {
    const writes: Observable<unknown>[] = [];
    for (const [slug, status] of Object.entries(after)) {
      if (before[slug] !== status) {
        writes.push(this.setListing(vendorSlug, productId, slug, status === 'available'));
      }
    }
    for (const slug of Object.keys(before)) {
      if (!(slug in after)) {
        writes.push(
          this.client.request<RemoveProductListingMutation, RemoveProductListingMutationVariables>(
            REMOVE_PRODUCT_LISTING,
            { productId, marketId: this.marketId(vendorSlug, slug) },
          ),
        );
      }
    }
    return this.all(writes);
  }

  /** `forkJoin`, but an empty list emits `null` rather than never completing. */
  private all(requests: readonly Observable<unknown>[]): Observable<unknown> {
    return requests.length ? forkJoin(requests) : of(null);
  }

  /**
   * Folds a freshly written `ProductModel` into the session board and hands the
   * row back. The mutation returns before its listing writes run, so the
   * draft's `listings` are the source of truth for where it is sold.
   */
  private remember(
    vendorSlug: string,
    product: ProductFieldsFragment,
    listings: Readonly<Record<string, ListingStatus>>,
  ): VendorProduct {
    const bySlug = this.marketIds.get(vendorSlug) ?? new Map<string, string>();
    const slugById = new Map([...bySlug].map(([slug, id]) => [id, slug]));
    const row: VendorProduct = { ...toVendorProduct(product, slugById), listings: { ...listings } };
    this.fixture.upsertProduct(vendorSlug, row);
    return row;
  }
}
