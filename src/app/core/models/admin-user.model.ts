/**
 * A member of the MarketDay platform team who can sign in to the admin console.
 * Mirrors the shape the backend will return for the authenticated principal.
 */
export interface AdminUser {
  id: string;
  name: string;
  email: string;
  /** Human-readable role label, e.g. "Super admin", "Support agent". */
  role: string;
}

/* ────────────────────────────────────────────────────────────────────────────
   Profile (design 1k) — the signed-in person's own settings.
──────────────────────────────────────────────────────────────────────────── */

/** The emails and pushes an admin can turn off. */
export type NotificationKey = 'payoutSummary' | 'vendorApplications' | 'marketDayReminders';

export const NOTIFICATION_KEYS: readonly NotificationKey[] = [
  'payoutSummary',
  'vendorApplications',
  'marketDayReminders',
];

export const NOTIFICATION_LABELS: Record<NotificationKey, string> = {
  payoutSummary: 'Weekly vendor payout summary',
  vendorApplications: 'New vendor applications',
  marketDayReminders: 'Market day reminders',
};

/**
 * The signed-in admin's own account (design 1k). A superset of
 * {@link AdminUser}: that is what the session carries and the drawer renders,
 * this is what the settings screen edits.
 *
 * Note for the GraphQL swap: `UserModel` covers the name, email, phone and
 * avatar. Two-factor and the notification preferences have **no column
 * server-side** yet, and `role` is deliberately not editable from here — only
 * a super admin changes someone's role, and never their own.
 */
export interface AdminProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  /** "+353 87 214 4471". Empty when they have not added one. */
  phone: string;
  /** The same label the drawer shows — "Super admin". Read-only here. */
  role: string;
  /** Their photo, or `null` for initials on a tinted ground. */
  avatarUrl: string | null;
  /** "Last changed 4 months ago". */
  passwordChanged: string;
  twoFactor: boolean;
  /** "SMS to number ending 4471" — how the second factor reaches them. */
  twoFactorHint: string;
  notifications: Readonly<Record<NotificationKey, boolean>>;
}

/** What the Profile screen sends back — everything on it a person may change. */
export type AdminProfilePatch = Pick<
  AdminProfile,
  'firstName' | 'lastName' | 'phone' | 'avatarUrl' | 'twoFactor' | 'notifications'
>;
