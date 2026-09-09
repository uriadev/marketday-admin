import { Observable } from 'rxjs';
import {
  ListingStatus,
  ProductDraft,
  ProductForm,
  ProductListQuery,
  VendorProduct,
  VendorProductBoardPage,
} from '../../models/product.model';

/**
 * Port for a vendor's products and where each one is sold (design 3a).
 *
 * Products are their own aggregate rather than part of the vendor: the backend
 * reads them with `products(vendorId:, marketId:)` and writes a status with
 * `setProductListing`, so the console keeps the same seam.
 *
 * Every command is named after the thing an admin actually does — there is no
 * general `update`. A status only ever moves between the two values of
 * {@link ListingStatus}, and `setStatus` is rejected for a market the product
 * is not carried at: that is a listing to create, not a status to flip.
 */
export abstract class ProductRepository {
  /**
   * One page of the grid, with the markets that are its columns and the
   * catalogue-wide facets around it. Rejects when no vendor matches
   * `vendorSlug`.
   *
   * The query is the whole request — filters and page together — for the same
   * reason `VendorRepository.list` takes one: narrowing a page that was already
   * cut would filter the screen rather than the catalogue.
   */
  abstract board(vendorSlug: string, query: ProductListQuery): Observable<VendorProductBoardPage>;

  /**
   * One cell of the grid — `setProductListing(isAvailable:)` on the backend.
   *
   * Every command below answers with the board page `query` names rather than
   * with the rows it changed. Flipping one cell moves the rails and the market
   * tallies with it, and those describe the catalogue: only the repository can
   * restate them, so it hands back a page and its facets in one consistent
   * snapshot instead of leaving the caller to patch a total it cannot see.
   */
  abstract setStatus(
    vendorSlug: string,
    productId: string,
    marketSlug: string,
    status: ListingStatus,
    query: ProductListQuery,
  ): Observable<VendorProductBoardPage>;

  /** Takes the whole list off one market's shopper view — a day that finished early. */
  abstract markMarketSoldOut(
    vendorSlug: string,
    marketSlug: string,
    query: ProductListQuery,
  ): Observable<VendorProductBoardPage>;

  /** Puts every sold-out listing back to available, as midnight does on its own. */
  abstract resetSoldOut(
    vendorSlug: string,
    query: ProductListQuery,
  ): Observable<VendorProductBoardPage>;

  /** Hides or shows a product at every market at once — `toggleProduct`. */
  abstract setHidden(
    vendorSlug: string,
    productId: string,
    hidden: boolean,
    query: ProductListQuery,
  ): Observable<VendorProductBoardPage>;

  /**
   * What the product form opens with (design 4a). `productId` is `null` for
   * `/products/new`, which still needs the vendor's markets — adding a product
   * and saying where it is sold are one decision, not two screens.
   *
   * Rejects when no vendor matches `vendorSlug`, or when `productId` names a
   * product that vendor does not sell.
   */
  abstract form(vendorSlug: string, productId: string | null): Observable<ProductForm>;

  /** `createProduct`, plus a `setProductListing` for each market it is carried at. */
  abstract create(vendorSlug: string, draft: ProductDraft): Observable<VendorProduct>;

  /**
   * `updateProduct`, plus the listing writes the draft implies —
   * `setProductListing` where the status changed, `removeProductListing` where
   * a market was switched off.
   */
  abstract update(
    vendorSlug: string,
    productId: string,
    draft: ProductDraft,
  ): Observable<VendorProduct>;

  /**
   * Takes the product off every market. The backend has no `deleteProduct`
   * mutation yet — `../backend/src/products/products.service.ts` stops at
   * `removeListing` — so the GraphQL adapter will need one added before it can
   * implement this.
   */
  abstract remove(vendorSlug: string, productId: string): Observable<void>;
}
