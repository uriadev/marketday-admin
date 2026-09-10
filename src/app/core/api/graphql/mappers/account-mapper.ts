import {
  Account,
  AccountRole,
  AccountStatus,
  SignUpBucket,
  UserRole,
} from '../../../models/account.model';
import { AdminUserFieldsFragment, AdminUserStatus, UserRole as GqlUserRole } from '../generated';

export type GqlAdminUser = AdminUserFieldsFragment;

/**
 * The console role behind each backend one. `ADMIN` is always `admin` here:
 * nothing server-side says which admins organise a market or answer support,
 * so `organiser` and `support` are never produced (`account.model.ts`).
 */
const ROLE: Record<GqlUserRole, AccountRole> = {
  [GqlUserRole.Buyer]: 'shopper',
  [GqlUserRole.Vendor]: 'vendor-staff',
  [GqlUserRole.Admin]: 'admin',
};

const USER_ROLE: Record<GqlUserRole, UserRole> = {
  [GqlUserRole.Buyer]: UserRole.Buyer,
  [GqlUserRole.Vendor]: UserRole.Vendor,
  [GqlUserRole.Admin]: UserRole.Admin,
};

const STATUS: Record<AdminUserStatus, AccountStatus> = {
  [AdminUserStatus.Active]: 'active',
  [AdminUserStatus.Invited]: 'invited',
  [AdminUserStatus.Suspended]: 'suspended',
};

/** What the console calls each role, for the backend's `role` filter. */
export const GQL_ROLE: Partial<Record<AccountRole, GqlUserRole>> = {
  shopper: GqlUserRole.Buyer,
  'vendor-staff': GqlUserRole.Vendor,
  admin: GqlUserRole.Admin,
};

export const GQL_STATUS: Record<AccountStatus, AdminUserStatus> = {
  active: AdminUserStatus.Active,
  invited: AdminUserStatus.Invited,
  suspended: AdminUserStatus.Suspended,
};

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** "14 March 2021". */
function dayLabel(timestamp: string): string {
  return new Date(timestamp).toLocaleDateString('en-IE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * "4m ago", "2h ago", "3d ago", "3w ago" — the design's register — and past
 * about a month, the day itself, since "14w ago" makes a reader do sums.
 * `lastSeenAt` moves on every sign-in and session refresh, so for someone
 * using the app it is accurate to about one access-token lifetime.
 */
function lastActiveLabel(lastSeenAt: string | null, now: Date): string {
  if (lastSeenAt === null) return 'Never';
  const minutes = Math.floor((now.getTime() - new Date(lastSeenAt).getTime()) / MINUTE);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return dayLabel(lastSeenAt);
}

/**
 * The "Signed up" menu's bucket, measured the same way the adapter asks the
 * server (`signedUpCriteria`): the last 30 days, then since 1 January.
 */
function signUpBucket(createdAt: string, now: Date): SignUpBucket {
  const created = new Date(createdAt).getTime();
  if (now.getTime() - created <= 30 * DAY) return 'last30';
  return created >= new Date(now.getFullYear(), 0, 1).getTime() ? 'thisYear' : 'earlier';
}

/**
 * One row of design 1i from an `AdminUserModel`.
 *
 * "Attached to" is the vendor the person holds a seat at, linked to its
 * detail; an admin is "MarketDay team"; a shopper is attached to nothing.
 *
 * A suspended account is redacted here, as the fixture does: the backend
 * still holds the name and email (a restore has nothing to put back), but a
 * suspended account's name is not something the console keeps showing around
 * the office. The reference number is the head of its id, which is enough to
 * quote in an appeal without being the whole key.
 */
export function toAccount(user: GqlAdminUser, now: Date = new Date()): Account {
  const status = STATUS[user.status];
  const suspended = status === 'suspended';
  const vendor = user.vendor;

  const attached = vendor
    ? { attached: vendor.name, attachedLink: ['/vendors', vendor.slug] as readonly string[] }
    : user.role === GqlUserRole.Admin
      ? { attached: 'MarketDay team', attachedLink: null }
      : { attached: '—', attachedLink: null };

  return {
    id: user.id,
    name: suspended ? `Account #${user.id.slice(0, 8)}` : user.fullName,
    email: suspended ? 'hidden after suspension' : user.email,
    role: ROLE[user.role],
    userRole: USER_ROLE[user.role],
    attached: attached.attached,
    attachedLink: suspended ? null : attached.attachedLink,
    lastActive: lastActiveLabel(user.lastSeenAt, now),
    signedUp: dayLabel(user.createdAt),
    signedUpBucket: signUpBucket(user.createdAt, now),
    status,
    suspendedNote: suspended ? suspensionNote(user) : null,
  };
}

/** "Repeated no-shows · suspended by Áine Ryan". */
function suspensionNote(user: GqlAdminUser): string {
  const reason = user.suspensionReason?.trim() || 'No reason recorded';
  return user.suspendedByName
    ? `${reason} · suspended by ${user.suspendedByName}`
    : `${reason} · suspended`;
}
