import { Observable } from 'rxjs';
import {
  VendorDetail,
  VendorDirectoryPage,
  VendorInvite,
  VendorInviteSummary,
  VendorListQuery,
  VendorProfile,
  VendorProfilePatch,
  VendorSummary,
} from '../../models/vendor.model';

/**
 * Port for the vendors aggregate — the platform directory (design 1a) and one
 * vendor's detail tabs (design 1b).
 *
 * A vendor is a platform record, not a row inside one market: `list()` returns
 * one entry per vendor with its memberships folded in, which is what lets the
 * directory answer "who trades at two or more markets" without a join per row.
 */
export abstract class VendorRepository {
  /**
   * One page of the directory, narrowed and counted.
   *
   * Filters travel with the page rather than being applied to the answer: the
   * caller holds one page and could only narrow that, which would filter the
   * screen instead of the directory. How much of the query reaches the server
   * is each implementation's business — the fixtures narrow everything they
   * hold, `GraphqlVendorRepository` pushes down what `adminVendors` can express
   * and reads the collection when a filter needs it — but the answer is the
   * same shape either way: the page, the total behind the filters, and the
   * directory-wide facets the header and market menu read.
   */
  abstract list(query: VendorListQuery): Observable<VendorDirectoryPage>;
  /** Rejects with an error when no vendor matches `slug`. */
  abstract detail(slug: string): Observable<VendorDetail>;

  /**
   * The editable record behind the Profile tab (design 2a). Separate from
   * `detail()` because it is a different shape for a different job: `detail()`
   * is a read-only projection the other tabs render, this is the form's own
   * value and what `save` writes back.
   */
  abstract profile(slug: string): Observable<VendorProfile>;

  /** Publishes the profile to every market page the vendor trades at. */
  abstract saveProfile(slug: string, patch: VendorProfilePatch): Observable<VendorProfile>;

  /**
   * Activates or deactivates a vendor — the directory's row menu. An inactive
   * vendor cannot take an order and drops out of search; nothing else about it
   * changes, and activating it again restores it as it was.
   *
   * Answers with the directory row as the server now holds it, so the caller
   * shows what was stored rather than what it asked for. Rejects when no vendor
   * matches `slug`.
   */
  abstract setActive(slug: string, active: boolean): Observable<VendorSummary>;

  /** Invitation policy and how many have gone out this month (design 1n). */
  abstract inviteSummary(): Observable<VendorInviteSummary>;

  /**
   * Creates the vendor and returns the directory row it makes. Whether it
   * opens live is the invite's `skipApplicationReview`: on, it trades at once;
   * off, it is held inactive until {@link setActive} switches it on.
   */
  abstract invite(invite: VendorInvite): Observable<VendorSummary>;
}
