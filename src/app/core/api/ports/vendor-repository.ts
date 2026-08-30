import { Observable } from 'rxjs';
import {
  VendorDetail,
  VendorInvite,
  VendorInviteSummary,
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
  abstract list(): Observable<readonly VendorSummary[]>;
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

  /** Invitation policy and how many have gone out this month (design 1n). */
  abstract inviteSummary(): Observable<VendorInviteSummary>;

  /**
   * Sends an invitation and returns the directory row it creates — an
   * `invited` vendor, waiting on them to sign up rather than on a decision
   * from us.
   */
  abstract invite(invite: VendorInvite): Observable<VendorSummary>;
}
