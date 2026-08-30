import { Observable } from 'rxjs';
import { ListingStatus, VendorProduct, VendorProductBoard } from '../../models/product.model';

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
  /** Rejects with an error when no vendor matches `vendorSlug`. */
  abstract board(vendorSlug: string): Observable<VendorProductBoard>;

  /** One cell of the grid — `setProductListing(isAvailable:)` on the backend. */
  abstract setStatus(
    vendorSlug: string,
    productId: string,
    marketSlug: string,
    status: ListingStatus,
  ): Observable<VendorProduct>;

  /** Takes the whole list off one market's shopper view — a day that finished early. */
  abstract markMarketSoldOut(
    vendorSlug: string,
    marketSlug: string,
  ): Observable<readonly VendorProduct[]>;

  /** Puts every sold-out listing back to available, as midnight does on its own. */
  abstract resetSoldOut(vendorSlug: string): Observable<readonly VendorProduct[]>;

  /** Hides or shows a product at every market at once — `toggleProduct`. */
  abstract setHidden(
    vendorSlug: string,
    productId: string,
    hidden: boolean,
  ): Observable<VendorProduct>;
}
