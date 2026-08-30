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
 * support, and the platform team. Note for the GraphQL swap: nothing
 * server-side records which market an admin organises, so that split is a
 * console distinction with **no column behind it** yet — the adapter derives it
 * from what the account is attached to, exactly as the fixture does.
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
  /** "18m ago". */
  lastActive: string;
  /** Sorts the table without parsing `lastActive`. Smaller is more recent. */
  lastActiveRank: number;
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
