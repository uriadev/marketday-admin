import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, of, throwError } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { VendorRepository } from '../ports/vendor-repository';
import {
  VendorDetail,
  VendorInvite,
  VendorInviteSummary,
  VendorProfile,
  VendorProfilePatch,
  VendorSummary,
} from '../../models/vendor.model';
import { GraphqlClient } from './graphql-client';
import { ADMIN_VENDORS, ADMIN_VENDOR_MEMBERS, VENDOR_BY_ID } from './operations/vendor';
import {
  GqlVendor,
  GqlVendorMember,
  toVendorDetail,
  toVendorProfile,
  toVendorSummary,
} from './mappers/vendor-mapper';
import {
  AdminVendorMembersQuery,
  AdminVendorMembersQueryVariables,
  AdminVendorsQuery,
  AdminVendorsQueryVariables,
  FilterOperator,
  VendorByIdQuery,
  VendorByIdQueryVariables,
} from './generated';

/** The backend's invitation policy — no query exposes it yet (gap below). */
const INVITE_POLICY = { linkValidDays: 14, reminderAfterDays: 5 };
/** Invitations already counted this month, before this session's own. */
const INVITES_SENT_BEFORE_SESSION = 14;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * `adminVendors` (`@Roles(ADMIN)`, closes `docs/backend-api-gaps.md` #2) and
 * `vendor(id)` are the whole of the vendor surface the schema covers, and both
 * return the thin `VendorModel` — a `memberCount` but no per-market fees,
 * applications or documents, and no roster inline. `detail()` folds the roster
 * in with a third call to the admin-only `adminVendorMembers` (`@Roles(ADMIN)`)
 * for the Staff tab (design 1c); the directory does not fan out to it. So
 * `list()`, `detail()` and the Profile tab's *read* are wired to the API (thin
 * but honest, the way `GraphqlMarketRepository` is), and the rest has no admin
 * endpoint to call:
 *
 * - `saveProfile` — `updateVendor` is owner-only server-side (`assertOwner`
 *   throws for an admin, gap #7), so an edit is held in memory for the session
 *   and layered over the real read, openly not persisted — the same move
 *   `GraphqlProfileRepository` makes for its uncovered fields.
 * - `invite` / `inviteSummary` — no vendor-application/invitation model
 *   (gap #9). An invitation adds a row to this session's directory and nothing
 *   more, which is what keeps design 1n → 1a a real flow rather than a form
 *   that swallows its input.
 */
@Injectable()
export class GraphqlVendorRepository extends VendorRepository {
  private readonly client = inject(GraphqlClient);

  /** `vendor(id)` is ID-only; the console routes by slug. Filled from `adminVendors`. */
  private readonly idBySlug = new Map<string, string>();
  /** Profile edits made this session, keyed by slug — not persisted server-side. */
  private readonly edits = new Map<string, VendorProfile>();
  /** Vendors invited this session, keyed by slug. */
  private readonly invited = new Map<string, VendorSummary>();

  override list(): Observable<readonly VendorSummary[]> {
    return this.fetchAdminVendors().pipe(
      map((vendors) => [...vendors.map(toVendorSummary), ...this.invited.values()]),
    );
  }

  override detail(slug: string): Observable<VendorDetail> {
    return this.resolveId(slug).pipe(
      switchMap((id) =>
        forkJoin({
          vendor: this.fetchVendor(id),
          members: this.fetchMembers(id),
        }),
      ),
      map(({ vendor, members }) => toVendorDetail(vendor, members)),
    );
  }

  override profile(slug: string): Observable<VendorProfile> {
    const edited = this.edits.get(slug);
    if (edited) return of(edited);
    return this.resolveId(slug).pipe(
      switchMap((id) => this.fetchVendor(id)),
      map(toVendorProfile),
    );
  }

  override saveProfile(slug: string, patch: VendorProfilePatch): Observable<VendorProfile> {
    if (patch.tradingName.trim() === '') {
      return throwError(() => new Error('A vendor needs a trading name.'));
    }
    return this.profile(slug).pipe(
      map((current) => {
        const saved: VendorProfile = {
          ...current,
          ...patch,
          lastEdited: 'Last edited just now',
          lastEditedBy: 'by you, in the admin console — not yet published to the backend',
        };
        this.edits.set(slug, saved);
        return saved;
      }),
    );
  }

  override inviteSummary(): Observable<VendorInviteSummary> {
    return of({
      sentThisMonth: INVITES_SENT_BEFORE_SESSION + this.invited.size,
      ...INVITE_POLICY,
    });
  }

  override invite(invite: VendorInvite): Observable<VendorSummary> {
    const slug = slugify(invite.businessName);
    if (!slug) {
      return throwError(() => new Error('An invitation needs a business name.'));
    }
    if (this.invited.has(slug)) {
      return throwError(() => new Error(`${invite.businessName} has already been invited.`));
    }
    const summary: VendorSummary = {
      id: `vnd-${slug}`,
      slug,
      name: invite.businessName,
      meta: `${invite.trade} · invited just now`,
      markets: [],
      appliedLabel: null,
      staff: invite.contactName ? [invite.contactName] : [],
      staffCount: invite.contactName ? 1 : 0,
      standing: 'invited',
      standingLabel: 'Invitation pending',
    };
    this.invited.set(slug, summary);
    return of(summary);
  }

  private fetchAdminVendors(): Observable<readonly GqlVendor[]> {
    return this.client
      .request<AdminVendorsQuery, AdminVendorsQueryVariables>(ADMIN_VENDORS, {})
      .pipe(
        map((result) => {
          for (const vendor of result.adminVendors.items) {
            this.idBySlug.set(vendor.slug, vendor.id);
          }
          return result.adminVendors.items;
        }),
      );
  }

  private fetchVendor(id: string): Observable<GqlVendor> {
    return this.client
      .request<VendorByIdQuery, VendorByIdQueryVariables>(VENDOR_BY_ID, { id })
      .pipe(
        map((result) => {
          if (!result.vendor) throw new Error('That vendor could not be found.');
          this.idBySlug.set(result.vendor.slug, result.vendor.id);
          return result.vendor;
        }),
      );
  }

  /**
   * One vendor's roster for the Staff tab (design 1c) — `adminVendorMembers`
   * filtered to this vendor, one row per seat, folded to one row per person by
   * `toVendorStaff`. `limit` is lifted well past the backend's default 20 so a
   * large team comes back whole; `totalCount` is ignored — the tab shows the
   * roster in full rather than paging it. An unknown id yields an empty page,
   * the same answer a real vendor with no seats gives.
   */
  private fetchMembers(id: string): Observable<readonly GqlVendorMember[]> {
    return this.client
      .request<AdminVendorMembersQuery, AdminVendorMembersQueryVariables>(ADMIN_VENDOR_MEMBERS, {
        criteria: {
          filters: [{ field: 'vendorId', operator: FilterOperator.Equal, value: id }],
          limit: 200,
        },
      })
      .pipe(map((result) => result.adminVendorMembers.items));
  }

  /** Refills the slug → id map from `adminVendors` when asked for an unknown slug. */
  private resolveId(slug: string): Observable<string> {
    const known = this.idBySlug.get(slug);
    if (known) return of(known);
    return this.fetchAdminVendors().pipe(
      map(() => {
        const id = this.idBySlug.get(slug);
        if (!id) throw new Error('That vendor could not be found.');
        return id;
      }),
    );
  }
}
