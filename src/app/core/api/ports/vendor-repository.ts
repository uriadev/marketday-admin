import { Observable } from 'rxjs';
import {
  VendorDetail,
  VendorDirectoryPage,
  VendorInvite,
  VendorInviteSummary,
  VendorListQuery,
  VendorProfile,
  VendorProfilePatch,
  VendorStaffInvite,
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

  /**
   * Puts a vendor that already exists on a market's roster — the market's
   * Vendors tab and the vendor's Markets tab both send this. Idempotent: a
   * vendor already trading there is left exactly as it is, live pause
   * included, rather than being reset by a second tap.
   *
   * Answers with nothing on purpose. Neither caller can rebuild its screen
   * from what the mutation returns — a roster row is the market-scoped
   * projection `vendors(marketId:)` gives, and a membership card needs the
   * per-market order window the detail read fans out for — so both reload
   * from their own read. Handing back a row nobody can use would be theatre.
   *
   * Rejects when no vendor matches `vendorSlug` or no market `marketSlug`.
   */
  abstract addToMarket(vendorSlug: string, marketSlug: string): Observable<void>;

  /**
   * Takes the vendor off that roster again — the undo for
   * {@link addToMarket}, and **destructive**: the stall row carries this
   * market's order lead time and any live pause, and its product listings at
   * this market go with it. A later rejoin starts from the defaults rather
   * than from what was there. Both screens confirm before calling it.
   *
   * Rejects when the vendor does not trade at that market.
   */
  abstract removeFromMarket(vendorSlug: string, marketSlug: string): Observable<void>;

  /* ── The team (design 1c) ─────────────────────────────────────────────────
     Four writes over one roster. Each answers with nothing and the tab
     reloads `detail()`, for {@link addToMarket}'s reason: a seat row on that
     screen is a person folded together with their stall and their outstanding
     invitation, which no single mutation returns.                          */

  /**
   * Offers someone a seat at one of the vendor's stalls. The backend mails
   * them a 6-digit code and the row shows as *Invitation pending* until they
   * redeem it; nothing exists for that person until they do.
   *
   * Sending again to the same address supersedes the outstanding code rather
   * than adding a second invitation, which is what makes *Resend* safe to
   * press twice. Rejects when the vendor does not trade at `marketSlug` —
   * inviting someone to a market the business does not attend is caught now
   * rather than when they try to accept.
   */
  abstract inviteStaff(vendorSlug: string, invite: VendorStaffInvite): Observable<void>;

  /**
   * Withdraws an invitation that has not been accepted — the row's *Cancel
   * invite*. The code stops working; nothing is removed, because nobody was
   * ever added.
   */
  abstract revokeStaffInvite(vendorSlug: string, inviteId: string): Observable<void>;

  /**
   * Moves a stallholder to a different one of the vendor's markets.
   *
   * A **move**, never an addition: one person holds at most one seat, so a
   * stallholder works one market at a time. The owner has no market scope to
   * change — they span every market the vendor trades at — and is refused
   * server-side rather than silently pinned.
   */
  abstract moveStaffToMarket(
    vendorSlug: string,
    staffId: string,
    marketSlug: string,
  ): Observable<void>;

  /**
   * Takes someone off the team. Their seat goes and their account drops back
   * to a plain buyer's in the same transaction, so a removed stallholder
   * cannot keep signing in to the vendor app.
   *
   * The **owner cannot be removed**, by anyone: their seat is the only route
   * back into the business. Rejects rather than leaving a vendor nobody can
   * manage.
   */
  abstract removeStaff(vendorSlug: string, staffId: string): Observable<void>;

  /** Invitation policy and how many have gone out this month (design 1n). */
  abstract inviteSummary(): Observable<VendorInviteSummary>;

  /**
   * Creates the vendor and returns the directory row it makes. Whether it
   * opens live is the invite's `skipApplicationReview`: on, it trades at once;
   * off, it is held inactive until {@link setActive} switches it on.
   */
  abstract invite(invite: VendorInvite): Observable<VendorSummary>;
}
