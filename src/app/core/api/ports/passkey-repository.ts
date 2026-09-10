import { Observable } from 'rxjs';
import { Passkey } from '../../models/passkey.model';

/**
 * Port for the signed-in admin's own passkeys. Signing in *with* one is
 * `AuthRepository`'s job; this is the managing of them. An `abstract class` so
 * it doubles as the DI token, like every port under `core/api/ports/`.
 */
export abstract class PasskeyRepository {
  /** Oldest first — the order they were added in. */
  abstract list(): Observable<Passkey[]>;

  /**
   * Runs the browser's "create a passkey" prompt and stores what it makes.
   * Errors with `PasskeyCancelledError` (`core/auth/webauthn.ts`) when the
   * person dismisses the prompt.
   */
  abstract register(): Observable<Passkey>;

  abstract rename(id: string, name: string): Observable<Passkey>;

  /**
   * Stops it signing anyone in. The passkey itself stays in the device's
   * keychain until deleted there; offered again, it is refused.
   */
  abstract remove(id: string): Observable<void>;
}
