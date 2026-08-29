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
