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
import {
  ADMIN_VENDORS,
  ADMIN_VENDOR_MEMBERS,
  CREATE_VENDOR,
  MARKET_IDS,
  UPDATE_VENDOR,
  VENDOR_BY_ID,
} from './operations/vendor';
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
  CreateVendorMutation,
  CreateVendorMutationVariables,
  FilterOperator,
  MarketIdsQuery,
  UpdateVendorMutation,
  UpdateVendorMutationVariables,
  VendorByIdQuery,
  VendorByIdQueryVariables,
} from './generated';

/** The backend's invitation policy — no query exposes it yet (gap below). */
const INVITE_POLICY = { linkValidDays: 14, reminderAfterDays: 5 };

/**
 * `adminVendors` (`@Roles(ADMIN)`, closes `docs/backend-api-gaps.md` #2) and
 * `vendor(id)` are the whole of the vendor surface the schema covers, and both
 * return the thin `VendorModel` — a `memberCount` but no per-market fees,
 * applications or documents, and no roster inline. `detail()` folds the roster
 * in with a third call to the admin-only `adminVendorMembers` (`@Roles(ADMIN)`)
 * for the Staff tab (design 1c); the directory does not fan out to it. So
 * `list()`, `detail()` and the Profile tab are wired to the API (thin but
 * honest, the way `GraphqlMarketRepository` is).
 *
 * `saveProfile` persists: `updateVendor` now takes an ADMIN branch that acts on
 * the vendor named in `id` before the owner-only seat lookup runs (gap #7's
 * write half, closed the same way `updateProduct` and the vendor presign were),
 * so the Profile tab writes through to the backend and reads its answer back.
 * What it sends is bounded by `UpdateVendorInput` rather than by the form: the
 * registered name, VAT, produce tags, contact block and address have no column
 * at all, so the screen disables them and this adapter drops them.
 *
 * One read still has no endpoint behind it:
 *
 * - `inviteSummary` — the policy is the backend's, but no query exposes it
 *   (gap #9), so the two windows are constants and `sentThisMonth` counts only
 *   what this session created.
 *
 * `invite` is the one write that lands. `createVendor` (`@Roles(ADMIN)`)
 * creates the business for real — joined to the markets the form scoped it to,
 * and **owned by the person the form names**: `ownerName`/`ownerEmail` seat
 * that person as `OWNER`, reusing their MarketDay account or creating a
 * passwordless one. The row comes back through the same `VendorFields`
 * fragment the reads use, so the new vendor is in the directory on the next
 * load rather than only in this session's memory.
 *
 * "Skip application review" lands too, on `isAcceptingOrders` — off creates the
 * stall paused, since there is no application model to hold "approved yet?".
 *
 * What it does **not** do is invite anyone. There is no endpoint that emails a
 * would-be owner (gap #9 — `inviteVendorMember` resolves the vendor from the
 * caller and only ever mints a STAFF seat), and the phone and personal note
 * have no column, so nothing is sent and those two are dropped. The new owner
 * reaches their account through Forgot password; the screen says so rather than
 * implying a message went out.
 */
@Injectable()
export class GraphqlVendorRepository extends VendorRepository {
  private readonly client = inject(GraphqlClient);

  /** `vendor(id)` is ID-only; the console routes by slug. Filled from `adminVendors`. */
  private readonly idBySlug = new Map<string, string>();
  /** The same slug → id problem for markets, which `createVendor` takes by id. */
  private readonly marketIdBySlug = new Map<string, string>();
  /** Vendors this session created, for `inviteSummary`'s running count. */
  private createdThisSession = 0;

  override list(): Observable<readonly VendorSummary[]> {
    return this.fetchAdminVendors().pipe(map((vendors) => vendors.map(toVendorSummary)));
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
    return this.resolveId(slug).pipe(
      switchMap((id) => this.fetchVendor(id)),
      map(toVendorProfile),
    );
  }

  /**
   * Publishes the record through `updateVendor`, and maps the row the backend
   * stored back through the same `toVendorProfile` the read uses — so what the
   * screen shows after a save is the server's copy rather than the form's, and
   * "Last edited" moves because `updatedAt` did.
   *
   * Only the four fields `UpdateVendorInput` has a column for are sent. The
   * rest of the patch — registered name, VAT, produce tags, the contact block,
   * the address — is disabled on the screen for exactly that reason, and
   * dropping it here is honest where sending it would be theatre. `slug` is
   * left out too: the backend never re-derives it from a changed `name`, so a
   * rename keeps the URL this console routes by and every link already shared.
   */
  override saveProfile(slug: string, patch: VendorProfilePatch): Observable<VendorProfile> {
    const name = patch.tradingName.trim();
    if (name === '') {
      return throwError(() => new Error('A vendor needs a trading name.'));
    }
    return this.resolveId(slug).pipe(
      switchMap((id) =>
        this.client.request<UpdateVendorMutation, UpdateVendorMutationVariables>(UPDATE_VENDOR, {
          id,
          input: {
            name,
            category: patch.category,
            description: patch.description,
            // Sent as an explicit `null` when the photo was cleared: omitting
            // the field reads as "leave it alone" server-side, which would keep
            // a picture the admin just removed.
            imageUrl: patch.imageUrl,
          },
        }),
      ),
      map((result) => {
        this.idBySlug.set(result.updateVendor.slug, result.updateVendor.id);
        return toVendorProfile(result.updateVendor);
      }),
    );
  }

  /**
   * Nothing server-side counts invitations (gap #9), so the count is this
   * session's own creates rather than a month's — the screen hides the line
   * while it is zero instead of stating a number it cannot know.
   */
  override inviteSummary(): Observable<VendorInviteSummary> {
    return of({ sentThisMonth: this.createdThisSession, ...INVITE_POLICY });
  }

  /**
   * Creates the vendor through `createVendor` and returns the directory row it
   * makes. The slug is left to the backend, which derives it from the name and
   * suffixes `-2`/`-3` past a collision — so two businesses of the same name
   * both land, rather than the second being refused as this used to do.
   *
   * The contact **is** the owner: `ownerName`/`ownerEmail` are what the backend
   * seats as the vendor's `OWNER`, reusing that person's MarketDay account if
   * the address already has one and creating a passwordless one if not. Both
   * are checked here as well as server-side, because an admin caller that omits
   * them is refused outright — there is deliberately no fallback that would
   * make the admin the owner.
   *
   * "Skip application review" rides on `isAcceptingOrders`. There is no
   * application model server-side to hold "approved yet?" (gap #9), so the flag
   * the schema *does* have carries it: toggle off means the stall is created
   * paused and shows as `Paused` in the directory until someone turns it on.
   * Always sent explicitly rather than left to the column default, because the
   * console always knows which the admin chose.
   *
   * `CreateVendorInput.description` is left unset on purpose: the form's note
   * is a private message to the invitee, while `description` is published to
   * shoppers on every market page the vendor trades at.
   */
  override invite(invite: VendorInvite): Observable<VendorSummary> {
    const name = invite.businessName.trim();
    if (!name) {
      return throwError(() => new Error('A vendor needs a business name.'));
    }
    const ownerName = invite.contactName.trim();
    const ownerEmail = invite.email.trim();
    if (!ownerName || !ownerEmail) {
      return throwError(() => new Error('A vendor needs an owner name and email address.'));
    }
    return this.resolveMarketIds(invite.marketSlugs).pipe(
      switchMap((marketIds) =>
        this.client.request<CreateVendorMutation, CreateVendorMutationVariables>(CREATE_VENDOR, {
          input: {
            name,
            category: invite.trade,
            ownerName,
            ownerEmail,
            isAcceptingOrders: invite.skipApplicationReview,
            // Omitted rather than sent empty: an empty list and "no scope" are
            // the same thing to the backend, and `marketIds` is nullable.
            ...(marketIds.length > 0 ? { marketIds } : {}),
          },
        }),
      ),
      map((result) => {
        this.createdThisSession += 1;
        this.idBySlug.set(result.createVendor.slug, result.createVendor.id);
        return toVendorSummary(result.createVendor);
      }),
    );
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

  /**
   * The market slugs the invite form scoped a vendor to, as the ids
   * `CreateVendorInput.marketIds` wants. One `adminMarkets` round trip fills
   * the map, and only when a slug is not already in it — the form's own market
   * list came from `MarketRepository`, but ports do not read each other
   * (`../../../../../docs/ARCHITECTURE.md` §1), so this adapter looks the ids up itself, the
   * same way `resolveId` does for a vendor.
   *
   * An unknown slug is an error rather than a silent drop: quietly creating
   * the vendor scoped to fewer markets than the admin picked is the kind of
   * lie this layer exists to avoid.
   */
  private resolveMarketIds(slugs: readonly string[]): Observable<string[]> {
    if (slugs.length === 0) return of([]);
    const known = slugs.every((slug) => this.marketIdBySlug.has(slug));
    const filled = known
      ? of(undefined)
      : this.client.request<MarketIdsQuery>(MARKET_IDS).pipe(
          map((result) => {
            for (const market of result.adminMarkets) {
              this.marketIdBySlug.set(market.slug, market.id);
            }
          }),
        );
    return filled.pipe(
      map(() =>
        slugs.map((slug) => {
          const id = this.marketIdBySlug.get(slug);
          if (!id) throw new Error(`No market matches “${slug}”.`);
          return id;
        }),
      ),
    );
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
