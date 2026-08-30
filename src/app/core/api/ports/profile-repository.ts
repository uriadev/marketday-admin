import { Observable } from 'rxjs';
import { AdminProfile, AdminProfilePatch } from '../../models/admin-user.model';

/**
 * Port for the signed-in admin's own settings (design 1k). Separate from
 * {@link AuthRepository}, which is about proving who you are, and from
 * {@link AccountRepository}, which is about everyone else.
 *
 * `email` and `role` are absent from the patch on purpose: changing an email is
 * a verification flow of its own, and nobody sets their own role.
 */
export abstract class ProfileRepository {
  abstract profile(): Observable<AdminProfile>;

  abstract save(patch: AdminProfilePatch): Observable<AdminProfile>;

  /**
   * Emails a reset link rather than taking a new password inline — the console
   * never handles a password it did not ask for behind a fresh sign-in.
   */
  abstract sendPasswordReset(): Observable<void>;
}
