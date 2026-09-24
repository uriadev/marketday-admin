import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, of, throwError } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { VendorRepository } from '../ports/vendor-repository';
import {
  VendorDetail,
  VendorDirectoryPage,
  VendorFilters,
  VendorInvite,
  VendorInviteSummary,
  VendorListQuery,
  VendorProfile,
  VendorProfilePatch,
  VendorStaffInvite,
  VendorSummary,
  matchesVendorFilters,
} from '../../models/vendor.model';
import { pageOf } from '../../models/page.model';
import { GraphqlClient } from './graphql-client';
import {
  ADMIN_VENDORS,
  ADMIN_VENDOR_MEMBERS,
  CREATE_VENDOR,
  INVITE_VENDOR_MEMBER,
  JOIN_MARKET,
  LEAVE_MARKET,
  MARKET_IDS,
  PENDING_VENDOR_INVITES,
  REMOVE_VENDOR_MEMBER,
  REVOKE_VENDOR_INVITE,
  UPDATE_VENDOR,
  UPDATE_VENDOR_MEMBER,
  VENDOR_BY_ID,
  VENDOR_ORDER_WINDOW,
  VENDOR_PRODUCT_COUNT,
} from './operations/vendor';
import { blankToNull } from './mappers/nullable';
import { GqlOrderWindow } from './mappers/order-window-mapper';
import {
  GqlVendor,
  GqlVendorInvite,
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
  CriteriaInput,
  FilterInput,
  FilterOperator,
  InviteVendorMemberMutation,
  InviteVendorMemberMutationVariables,
  JoinMarketMutation,
  JoinMarketMutationVariables,
  LeaveMarketMutation,
  LeaveMarketMutationVariables,
  MarketIdsQuery,
  OrderDirection,
  PendingVendorInvitesQuery,
  PendingVendorInvitesQueryVariables,
  RemoveVendorMemberMutation,
  RemoveVendorMemberMutationVariables,
  RevokeVendorInviteMutation,
  RevokeVendorInviteMutationVariables,
  UpdateVendorMemberMutation,
  UpdateVendorMemberMutationVariables,
  UpdateVendorMutation,
  UpdateVendorMutationVariables,
  VendorByIdQuery,
  VendorByIdQueryVariables,
  VendorOrderWindowQuery,
  VendorOrderWindowQueryVariables,
  VendorProductCountQuery,
  VendorProductCountQueryVariables,
} from './generated';

/** The backend's invitation policy — no query exposes it yet (gap below). */
const INVITE_POLICY = { linkValidDays: 14, reminderAfterDays: 5 };

/**
 * The first ask of a read that has to see the whole directory. It is a guess,
 * not a cap: `totalCount` comes back with the rows, so a directory larger than
 * this is re-read at its real size rather than silently narrowed from a
 * truncated list. Generous enough that the second trip is the rare case.
 */
const FULL_READ_LIMIT = 500;

/**
 * The filters `adminVendors` cannot express, so the only way to honour one is
 * to read the directory and narrow it here.
 *
 * `market` and `multiMarket` ask about the `vendor_markets` relation, which is
 * not among `VendorsService.FILTERABLE_FIELDS` and has no join to reach from a
 * `CriteriaInput` filter; `applications` and `feeUnpaid` ask about models the
 * backend does not have at all (`docs/backend-api-gaps.md` #5, #9), so they
 * match nothing here however they are asked — which is itself the honest
 * answer, and worth one read to give exactly.
 */
function needsFullRead(filters: VendorFilters): boolean {
  return (
    filters.market !== null || filters.multiMarket || filters.applications || filters.feeUnpaid
  );
}

/**
 * The half of the directory's filters `CriteriaInput` *can* carry.
 *
 * The search is `name ILIKE %q%` and nothing else: the console's own search
 * also reads the trade line, the market chips and the staff names, but a
 * server-paged screen cannot search rows it never fetched, and `name` is the
 * only text column `VendorsService` allows. Narrower than the fixtures, and
 * said so on the screen rather than papered over here.
 *
 * `paused` is `isActive = false`, exactly the rows `vendor-mapper.ts` gives a
 * `Paused` pill. The vendor-wide `isAcceptingOrders` it used to push is gone:
 * a stall now pauses at one market for one market day
 * (`../backend/specs/per-market-order-windows.md`), which is neither a column
 * on `vendors` nor something a directory row can show — the Markets tab does.
 */
function pushDown(filters: VendorFilters): FilterInput[] {
  const pushed: FilterInput[] = [];
  const needle = filters.q.trim();
  if (needle !== '') {
    pushed.push({ field: 'name', operator: FilterOperator.Contains, value: needle });
  }
  if (filters.paused) {
    pushed.push({ field: 'isActive', operator: FilterOperator.Equal, value: false });
  }
  return pushed;
}

/**
 * What is left for this adapter to apply to the rows it read — the filters
 * {@link pushDown} could not send, with the ones it did neutralised so they are
 * not applied twice under different rules. Without that, a search would match
 * on name server-side and on name-or-market-or-staff here, and the same needle
 * would mean two things depending on which other filter happened to be on.
 */
function clientSide(filters: VendorFilters): VendorFilters {
  return { ...filters, q: '', paused: false };
}

/** One `adminVendors` answer: the rows, the filtered count, the directory's. */
interface VendorRows {
  items: readonly VendorSummary[];
  totalCount: number;
  directoryTotal: number;
}

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
 * `list()` pages **server-side**: `limit`/`offset` and `totalCount` on
 * `adminVendors` are real, so the console asks for the page it is showing
 * instead of the whole directory — which it never received anyway, since an
 * absent `criteria` leaves `VendorsService.DEFAULT_LIMIT` capping the answer at
 * 20 rows. What the console cannot push down it still honours, by reading the
 * directory once and narrowing here — see {@link needsFullRead}. Either way it
 * is the same `VendorDirectoryPage`, so the screen above cannot tell which
 * happened.
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
 * "Skip application review" lands as `CreateVendorInput.isActive`. It used to
 * ride on the vendor-wide `isAcceptingOrders`, which the backend replaced with
 * per-market order windows whose pause clears itself at the end of the next
 * market day — nothing there can hold "not approved yet". `isActive` can:
 * a vendor created inactive is refused at checkout and dropped from search
 * until an admin activates it, which `setActive` does from the directory.
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
  /** Market names for the directory's market menu, filled by the same read. */
  private marketNamesCache: readonly string[] | null = null;
  /** Vendors this session created, for `inviteSummary`'s running count. */
  private createdThisSession = 0;

  /**
   * One page of the directory (design 1a), and the facts the header keeps
   * describing the whole of it with.
   *
   * Two routes to the same answer. When every filter that is on can be spelled
   * as a `CriteriaInput` filter, the server slices: `limit`/`offset` for the
   * page, `orderBy: name` so successive offsets cut a stable list rather than
   * whatever order the planner returned, and `totalCount` for the paginator.
   * When one cannot ({@link needsFullRead}), the rows have to be here to be
   * narrowed, so the directory is read whole — still with whatever *could* be
   * pushed down, so the read is as small as the API allows — and the page is
   * cut from what matched.
   *
   * `vendorCount` is the `directory` alias rather than `totalCount`, because
   * the header counts the directory and `totalCount` counts the filter.
   * `applicationCount` is 0: there is no application model server-side (gap
   * #9), so no row can be waiting on a decision and the chip's badge stays off
   * rather than showing a number the backend cannot mean.
   */
  override list(query: VendorListQuery): Observable<VendorDirectoryPage> {
    const { filters, page } = query;
    const criteria: CriteriaInput = {
      filters: pushDown(filters),
      orderBy: 'name',
      orderDir: OrderDirection.Asc,
    };
    const rows = needsFullRead(filters)
      ? this.readAll(criteria).pipe(
          map((result) => ({
            ...result,
            items: result.items.filter((vendor) =>
              matchesVendorFilters(vendor, clientSide(filters)),
            ),
            paged: false,
          })),
        )
      : this.readPage({ ...criteria, limit: page.size, offset: page.index * page.size }).pipe(
          map((result) => ({ ...result, paged: true })),
        );

    return forkJoin({
      rows,
      // The menu is a convenience; the table is the screen. A market list that
      // will not load leaves "Market: any" with nothing to offer rather than
      // taking the directory down with it, and is retried on the next page.
      markets: this.marketNames().pipe(catchError(() => of<readonly string[]>([]))),
    }).pipe(
      map(({ rows: result, markets }) => ({
        // A server-sliced answer is already the page; a narrowed one is the
        // whole match and gets cut here.
        ...(result.paged
          ? { items: result.items, total: result.totalCount }
          : pageOf(result.items, page)),
        facets: { markets, applicationCount: 0, vendorCount: result.directoryTotal },
      })),
    );
  }

  /**
   * The detail shell: the vendor, its roster, and each membership's order
   * window. The windows need the market ids the vendor read returns, so they
   * chain off it — while the roster, which needs only the id, runs beside both.
   */
  override detail(slug: string): Observable<VendorDetail> {
    return this.resolveId(slug).pipe(
      switchMap((id) =>
        forkJoin({
          vendor: this.fetchVendor(id).pipe(
            switchMap((vendor) =>
              this.fetchOrderWindows(vendor).pipe(map((windows) => ({ vendor, windows }))),
            ),
          ),
          members: this.fetchMembers(id),
          invites: this.fetchInvites(id),
          productCount: this.fetchProductCount(id),
        }),
      ),
      map(({ vendor: { vendor, windows }, members, invites, productCount }) =>
        toVendorDetail(vendor, members, windows, new Date(), invites, productCount),
      ),
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
            description: blankToNull(patch.description),
            imageUrl: blankToNull(patch.imageUrl),
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
   * Activates or deactivates the business through `updateVendor`, sending `isActive`
   * and nothing else — so, like the Profile tab's save in the other direction,
   * it cannot touch a field it was not asked to. `isActive` is admin-only
   * server-side, which is what makes deactivating mean something: an owner cannot
   * reopen what an admin closed.
   *
   * The row comes back through `toVendorSummary`, so the pill and the menu
   * label both read what the backend stored.
   */
  override setActive(slug: string, active: boolean): Observable<VendorSummary> {
    return this.resolveId(slug).pipe(
      switchMap((id) =>
        this.client.request<UpdateVendorMutation, UpdateVendorMutationVariables>(UPDATE_VENDOR, {
          id,
          input: { isActive: active },
        }),
      ),
      map((result) => toVendorSummary(result.updateVendor)),
    );
  }

  /**
   * Puts an existing vendor on a market's roster through `joinMarket`, which
   * grew an `vendorId` argument and an ADMIN branch for exactly this — until
   * then the only membership an admin could write was one `createVendor` made
   * at creation time (`docs/backend-api-gaps.md` #9).
   *
   * Both ids are looked up here rather than passed in: the console routes by
   * slug throughout, and ports do not read each other
   * (`../../../../../docs/ARCHITECTURE.md` §1), so this adapter resolves the
   * market the same way {@link invite} does. An unknown slug on either side is
   * an error rather than a silent no-op.
   *
   * The answer is discarded — see the port for why the callers reload instead.
   */
  override addToMarket(vendorSlug: string, marketSlug: string): Observable<void> {
    return this.stallIds(vendorSlug, marketSlug).pipe(
      switchMap(({ vendorId, marketId }) =>
        this.client.request<JoinMarketMutation, JoinMarketMutationVariables>(JOIN_MARKET, {
          vendorId,
          marketId,
        }),
      ),
      map(() => undefined),
    );
  }

  /**
   * Takes the stall away again through `leaveMarket`. Destructive server-side
   * — the row carries this market's lead time and pause, and the vendor's
   * listings here go with it — so the screens confirm before calling this; the
   * adapter just sends it.
   */
  override removeFromMarket(vendorSlug: string, marketSlug: string): Observable<void> {
    return this.stallIds(vendorSlug, marketSlug).pipe(
      switchMap(({ vendorId, marketId }) =>
        this.client.request<LeaveMarketMutation, LeaveMarketMutationVariables>(LEAVE_MARKET, {
          vendorId,
          marketId,
        }),
      ),
      map(() => undefined),
    );
  }

  /**
   * Offers a seat through `inviteVendorMember`, which mails the address a
   * 6-digit code. Nothing appears on the roster until they redeem it — the row
   * the tab draws meanwhile is the invitation itself, read back by
   * {@link fetchInvites}.
   *
   * `vendorId` is always sent: an admin holds no seat for the backend to infer
   * one from, and one who omits it is refused rather than defaulted, which is
   * what stops an invitation going out on behalf of a business nobody named.
   * The market is resolved from its slug the same way {@link addToMarket}'s is
   * — the console routes by slug and ports do not read each other.
   *
   * The address is trimmed and left to the backend to validate: `IsEmail` on
   * the input is the authority, and a second opinion here would only disagree
   * with it. Answers with nothing; the tab reloads `detail()`.
   */
  override inviteStaff(vendorSlug: string, invite: VendorStaffInvite): Observable<void> {
    const email = invite.email.trim();
    if (email === '') {
      return throwError(() => new Error('An invitation needs an email address.'));
    }
    return this.stallIds(vendorSlug, invite.marketSlug).pipe(
      switchMap(({ vendorId, marketId }) =>
        this.client.request<InviteVendorMemberMutation, InviteVendorMemberMutationVariables>(
          INVITE_VENDOR_MEMBER,
          { input: { email, marketId, vendorId } },
        ),
      ),
      map(() => undefined),
    );
  }

  /**
   * Withdraws an outstanding invitation. Scoped to the vendor server-side, so
   * an id from another business's roster answers `Invite not found` rather
   * than cancelling anything.
   */
  override revokeStaffInvite(vendorSlug: string, inviteId: string): Observable<void> {
    return this.resolveId(vendorSlug).pipe(
      switchMap((vendorId) =>
        this.client.request<RevokeVendorInviteMutation, RevokeVendorInviteMutationVariables>(
          REVOKE_VENDOR_INVITE,
          { id: inviteId, vendorId },
        ),
      ),
      map(() => undefined),
    );
  }

  /**
   * Moves a stallholder to another of the vendor's markets through
   * `updateVendorMember`. `staffId` is the person's **user id**, which is what
   * `toVendorStaff` keys a seated row by — an invitation row has no user to
   * move, and the screen does not offer this on one.
   *
   * The seat row it answers with is discarded: the tab reloads `detail()`,
   * which is what folds seats, invitations and markets into what it draws.
   */
  override moveStaffToMarket(
    vendorSlug: string,
    staffId: string,
    marketSlug: string,
  ): Observable<void> {
    return this.stallIds(vendorSlug, marketSlug).pipe(
      switchMap(({ vendorId, marketId }) =>
        this.client.request<UpdateVendorMemberMutation, UpdateVendorMemberMutationVariables>(
          UPDATE_VENDOR_MEMBER,
          { input: { userId: staffId, marketId, vendorId } },
        ),
      ),
      map(() => undefined),
    );
  }

  /**
   * Drops a seat through `removeVendorMember`, which demotes that account back
   * to a buyer's in the same transaction — so a removed stallholder cannot
   * keep signing in to the vendor app. The owner's seat is refused
   * server-side; the screen does not offer it either.
   */
  override removeStaff(vendorSlug: string, staffId: string): Observable<void> {
    return this.resolveId(vendorSlug).pipe(
      switchMap((vendorId) =>
        this.client.request<RemoveVendorMemberMutation, RemoveVendorMemberMutationVariables>(
          REMOVE_VENDOR_MEMBER,
          { userId: staffId, vendorId },
        ),
      ),
      map(() => undefined),
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
   * "Skip application review" is `isActive`: on, the vendor trades at the
   * markets the admin picked from the moment it exists; off, it is created
   * inactive at those same markets and waits for an admin to activate it. There
   * is still no application *model* (gap #9) — no submitted form, no decline —
   * but "not approved yet" no longer needs one. Either way it takes pre-orders
   * from `orderLeadHours` (left at the backend's default of 48) before each
   * market day once it is active.
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
            // Review required → created inactive. Always sent, `false` included:
            // omitting it would mean "live", the opposite of what was asked.
            isActive: invite.skipApplicationReview,
            // `null`, not `[]`: no market picked is "no scope", and `marketIds`
            // is nullable — an empty list would read as a real, empty one.
            marketIds: marketIds.length > 0 ? marketIds : null,
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

  /**
   * One `adminVendors` round trip, mapped to summaries and with the slug → id
   * map topped up from whatever came back. `totalCount` is the count behind
   * `criteria`'s filters; `directoryTotal` is the whole directory, from the
   * `directory` alias in the same document.
   */
  private readPage(criteria: CriteriaInput): Observable<VendorRows> {
    return this.client
      .request<AdminVendorsQuery, AdminVendorsQueryVariables>(ADMIN_VENDORS, { criteria })
      .pipe(
        map((result) => {
          for (const vendor of result.adminVendors.items) {
            this.idBySlug.set(vendor.slug, vendor.id);
          }
          return {
            items: result.adminVendors.items.map(toVendorSummary),
            totalCount: result.adminVendors.totalCount,
            directoryTotal: result.directory.totalCount,
          };
        }),
      );
  }

  /**
   * Every row matching `criteria`, for the reads that cannot be paged — a
   * filter the API cannot express, and the slug → id lookup, which has to be
   * able to find any vendor rather than the first {@link FULL_READ_LIMIT} of
   * them.
   *
   * The second trip fires only when the first was truncated, and asks for
   * exactly the count the first reported. Narrowing a truncated list would
   * quietly drop vendors that match, which is the one thing this fallback
   * exists to avoid.
   */
  private readAll(criteria: CriteriaInput): Observable<VendorRows> {
    return this.readPage({ ...criteria, limit: FULL_READ_LIMIT }).pipe(
      switchMap((result) =>
        result.items.length < result.totalCount
          ? this.readPage({ ...criteria, limit: result.totalCount })
          : of(result),
      ),
    );
  }

  /**
   * The market names the directory's "Market: any" menu offers, cached for the
   * session alongside the slug → id map the invite screen needs — one read
   * fills both. A market added while the console is open is missing from the
   * menu until the next visit, which is the trade for not re-reading the market
   * list on every page turn.
   */
  private marketNames(): Observable<readonly string[]> {
    if (this.marketNamesCache) return of(this.marketNamesCache);
    return this.client.request<MarketIdsQuery>(MARKET_IDS).pipe(
      map((result) => {
        for (const market of result.adminMarkets) {
          this.marketIdBySlug.set(market.slug, market.id);
        }
        this.marketNamesCache = result.adminMarkets
          .map((market) => market.name)
          .sort((a, b) => a.localeCompare(b));
        return this.marketNamesCache;
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
   * Each membership's `vendorOrderWindow`, keyed by market id — one call per
   * market, since the query takes one pair and `vendor(id)` hydrates none.
   *
   * A window that will not load is left out rather than failing the shell: the
   * card then shows no order status, and every other tab still opens. The
   * header and the Staff tab should not depend on a status line.
   */
  private fetchOrderWindows(vendor: GqlVendor): Observable<ReadonlyMap<string, GqlOrderWindow>> {
    if (vendor.markets.length === 0) return of(new Map());
    return forkJoin(
      vendor.markets.map((market) =>
        this.client
          .request<VendorOrderWindowQuery, VendorOrderWindowQueryVariables>(VENDOR_ORDER_WINDOW, {
            vendorId: vendor.id,
            marketId: market.id,
          })
          .pipe(
            map((result): GqlOrderWindow | null => result.vendorOrderWindow),
            catchError(() => of(null)),
          ),
      ),
    ).pipe(
      map(
        (windows) =>
          new Map(
            windows
              .filter((window): window is GqlOrderWindow => window !== null)
              .map((window) => [window.marketId, window]),
          ),
      ),
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
  /**
   * The Products tab badge. Swallowed to 0 like {@link fetchInvites}: a badge
   * is not worth keeping the whole vendor from opening. Retried on the next load.
   */
  private fetchProductCount(vendorId: string): Observable<number> {
    return this.client
      .request<VendorProductCountQuery, VendorProductCountQueryVariables>(VENDOR_PRODUCT_COUNT, {
        vendorId,
      })
      .pipe(
        map((result) => result.products.totalCount),
        catchError(() => of(0)),
      );
  }

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
   * The invitations this vendor has out — the *Invitation pending* rows of the
   * Staff tab, which `adminVendorMembers` cannot carry because a seat exists
   * only once an invite is accepted.
   *
   * Failure is swallowed to an empty list rather than taken to the shell: the
   * seats are the screen, and a tab that will not open because an offer list
   * would not load is worse than one that shows the team without the pending
   * offers. Retried on the next load.
   */
  private fetchInvites(id: string): Observable<readonly GqlVendorInvite[]> {
    return this.client
      .request<PendingVendorInvitesQuery, PendingVendorInvitesQueryVariables>(
        PENDING_VENDOR_INVITES,
        { vendorId: id },
      )
      .pipe(
        map((result) => result.pendingVendorInvites),
        catchError(() => of<readonly GqlVendorInvite[]>([])),
      );
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
    const filled: Observable<unknown> = known ? of(undefined) : this.marketNames();
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

  /**
   * The pair `joinMarket` and `leaveMarket` want, from the two slugs the
   * screens hold. Resolved together so a market the console does not know
   * fails before the vendor lookup has any bearing on the answer — either way
   * nothing is sent.
   */
  private stallIds(
    vendorSlug: string,
    marketSlug: string,
  ): Observable<{ vendorId: string; marketId: string }> {
    return forkJoin({
      vendorId: this.resolveId(vendorSlug),
      marketIds: this.resolveMarketIds([marketSlug]),
    }).pipe(map(({ vendorId, marketIds }) => ({ vendorId, marketId: marketIds[0]! })));
  }

  /** Refills the slug → id map from `adminVendors` when asked for an unknown slug. */
  private resolveId(slug: string): Observable<string> {
    const known = this.idBySlug.get(slug);
    if (known) return of(known);
    return this.readAll({}).pipe(
      map(() => {
        const id = this.idBySlug.get(slug);
        if (!id) throw new Error('That vendor could not be found.');
        return id;
      }),
    );
  }
}
