/**
 * One of the signed-in admin's passkeys, as Settings → Security lists it. No key
 * material — the private half never leaves the authenticator, and the public
 * half is the backend's business.
 */
export interface Passkey {
  id: string;
  /** Their own label for it — "MacBook", "Pixel". "Passkey" until renamed. */
  name: string;
  /**
   * Synced to a cloud keychain (iCloud Keychain, Google Password Manager…), so
   * it survives losing the device it was made on. Otherwise it lives on that
   * one device or security key.
   */
  synced: boolean;
  /** ISO timestamp. */
  createdAt: string;
  /** ISO timestamp, or `null` if it has never signed anyone in. */
  lastUsedAt: string | null;
}
