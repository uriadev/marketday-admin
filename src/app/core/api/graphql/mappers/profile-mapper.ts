import { AdminProfile, NOTIFICATION_KEYS, NotificationKey } from '../../../models/admin-user.model';
import { MeQuery, UserRole } from '../generated';

/**
 * `me` returns `UserProfileModel`, `updateMe` returns `UserModel` — different
 * GraphQL types with the same fields this mapper needs. `Omit`s the
 * `__typename` discriminant so either query/mutation result satisfies this
 * one shape, tied to the schema via `MeQuery` rather than hand-duplicated.
 */
export type GqlProfileUser = Omit<MeQuery['me'], '__typename'>;

/** No super-admin/support-agent tiers server-side — one `ADMIN` role for everyone. */
const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.Admin]: 'Admin',
  [UserRole.Vendor]: 'Vendor',
  [UserRole.Buyer]: 'Buyer',
};

export function splitName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim();
  const space = trimmed.indexOf(' ');
  if (space === -1) return { firstName: trimmed, lastName: '' };
  return { firstName: trimmed.slice(0, space), lastName: trimmed.slice(space + 1) };
}

export function joinName(firstName: string, lastName: string): string {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
}

/**
 * `twoFactor`, `twoFactorHint` and the notification toggles have no column
 * server-side (`admin-user.model.ts`'s own doc comment on `AdminProfile`).
 * `localOnly` is whatever `GraphqlProfileRepository` is holding for this
 * session — read once at sign-in, kept only in memory, and openly not
 * persisted, rather than silently dropped or invented.
 */
export function toAdminProfile(
  user: GqlProfileUser,
  localOnly: Pick<AdminProfile, 'twoFactor' | 'twoFactorHint' | 'notifications'>,
): AdminProfile {
  const { firstName, lastName } = splitName(user.fullName);
  return {
    id: user.id,
    firstName,
    lastName,
    email: user.email,
    phone: user.phone ?? '',
    role: ROLE_LABELS[user.role],
    avatarUrl: user.avatarUrl,
    passwordChanged: user.hasPassword ? 'Password set' : 'Signed in with Google — no password set',
    ...localOnly,
  };
}

export function defaultLocalOnly(): Pick<
  AdminProfile,
  'twoFactor' | 'twoFactorHint' | 'notifications'
> {
  const notifications = Object.fromEntries(
    NOTIFICATION_KEYS.map((key: NotificationKey) => [key, true]),
  ) as Record<NotificationKey, boolean>;
  return { twoFactor: false, twoFactorHint: '', notifications };
}
