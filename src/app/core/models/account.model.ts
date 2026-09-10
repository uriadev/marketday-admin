import { Page, PageRequest } from './page.model';

/**
 * What the backend records against a login. Mirrors the `UserRole` GraphQL enum
 * (`../backend/src/common/enums/user-role.enum.ts`) — three values, no more.
 */
export enum UserRole {
  Admin = 'ADMIN',
  Buyer = 'BUYER',
  Vendor = 'VENDOR',
}

/**
 * How the console groups accounts (design 1i) — finer than the backend's three.
 *
 * A `BUYER` is a shopper and a `VENDOR` is vendor staff, one for one. `ADMIN`
 * splits three ways here: someone who runs a market, someone who answers
 * support, and the platform team. Nothing server-side records which market an
 * admin organises or who answers support, so that split is a console
 * distinction with **no column behind it** yet: the fixture draws all three,
 * while `GraphqlAccountRepository` reads every `ADMIN` as `admin` and the other
 * two match nothing (`docs/backend-api-gaps.md` #1).
 */
export type AccountRole = 'shopper' | 'vendor-staff' | 'organiser' | 'support' | 'admin';

export const ACCOUNT_ROLE_LABELS: Record<AccountRole, string> = {
  shopper: 'Shopper',
  'vendor-staff': 'Vendor staff',
  organiser: 'Organiser',
  support: 'Support agent',
  admin: 'Platform admin',
};

/** The order the Role menu lists them in — shoppers first, the team last. */
export const ACCOUNT_ROLES: readonly AccountRole[] = [
  'shopper',
  'vendor-staff',
  'organiser',
  'support',
  'admin',
];

export type AccountStatus = 'active' | 'invited' | 'suspended';

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  active: 'Active',
  invited: 'Invited',
  suspended: 'Suspended',
};

export const ACCOUNT_STATUSES: readonly AccountStatus[] = ['active', 'invited', 'suspended'];

/** Roughly when an account was opened — what the "Signed up" menu filters on. */
export type SignUpBucket = 'last30' | 'thisYear' | 'earlier';

/** One row of the platform's account list (design 1i). */
export interface Account {
  id: string;
  /**
   * Redacted to "Account #3172" once suspended — a suspended account's name is
   * not something the console keeps showing around the office.
   */
  name: string;
  /** "hidden after suspension" once suspended. */
  email: string;
  role: AccountRole;
  /** What the backend would return for this account. */
  userRole: UserRole;
  /** "McNally Family Farm", "Temple Bar", "MarketDay team", "—". */
  attached: string;
  /** Router link for `attached`, or `null` when there is nothing to open. */
  attachedLink: readonly string[] | null;
  /** "18m ago", or "Never" for an account that has not signed in. */
  lastActive: string;
  /** "14 March 2021". */
  signedUp: string;
  signedUpBucket: SignUpBucket;
  status: AccountStatus;
  /** Why it was suspended, and by whom. `null` while the account is open. */
  suspendedNote: string | null;
}

/** How far back the "Signed up" menu reaches. */
export type SignUpFilter = 'any' | 'last30' | 'thisYear' | 'earlier';

export const SIGN_UP_FILTERS: readonly { value: SignUpFilter; label: string }[] = [
  { value: 'any', label: 'Any time' },
  { value: 'last30', label: 'Last 30 days' },
  { value: 'thisYear', label: 'This year' },
  { value: 'earlier', label: 'Before this year' },
];

/** Account list filters. Each one is a query param (§7). */
export interface AccountFilters {
  q: string;
  role: AccountRole | null;
  status: AccountStatus | null;
  signedUp: SignUpFilter;
}

export const EMPTY_ACCOUNT_FILTERS: AccountFilters = {
  q: '',
  role: null,
  status: null,
  signedUp: 'any',
};

/** What the Users screen asks the repository for: one page, narrowed. */
export interface AccountListQuery {
  filters: AccountFilters;
  page: PageRequest;
}

/**
 * Platform-wide counts a single page cannot carry. The header and the Role and
 * Status menus describe every account rather than the rows on screen, so the
 * repository — the only party that can still see all of them — hands them
 * back beside the page. None of them moves with the filters.
 */
export interface AccountDirectoryFacets {
  /** Every account on the platform — the header's count. */
  accountCount: number;
  roleCounts: Record<AccountRole, number>;
  statusCounts: Record<AccountStatus, number>;
}

export const EMPTY_ACCOUNT_FACETS: AccountDirectoryFacets = {
  accountCount: 0,
  roleCounts: { shopper: 0, 'vendor-staff': 0, organiser: 0, support: 0, admin: 0 },
  statusCounts: { active: 0, invited: 0, suspended: 0 },
};

export interface AccountDirectoryPage extends Page<Account> {
  facets: AccountDirectoryFacets;
}

/**
 * Whether one account survives the list filters, written once so every
 * repository that narrows in the browser narrows the same way. The menus
 * narrow together, so "Vendor staff" plus "Suspended" means exactly that.
 * "This year" includes the last 30 days, the way the menu reads.
 */
export function matchesAccountFilters(account: Account, filters: AccountFilters): boolean {
  const { q, role, status, signedUp } = filters;
  if (role !== null && account.role !== role) return false;
  if (status !== null && account.status !== status) return false;
  if (signedUp === 'last30' && account.signedUpBucket !== 'last30') return false;
  if (signedUp === 'thisYear' && account.signedUpBucket === 'earlier') return false;
  if (signedUp === 'earlier' && account.signedUpBucket !== 'earlier') return false;

  const needle = q.trim().toLowerCase();
  if (needle === '') return true;
  // The design's placeholder promises name or email, and nothing else.
  return (
    account.name.toLowerCase().includes(needle) || account.email.toLowerCase().includes(needle)
  );
}

export function hasAccountFilters(filters: AccountFilters): boolean {
  const { q, role, status, signedUp } = filters;
  return q.trim() !== '' || role !== null || status !== null || signedUp !== 'any';
}
