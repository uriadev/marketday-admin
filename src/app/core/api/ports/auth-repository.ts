import { Observable } from 'rxjs';
import { AdminUser } from '../../models/admin-user.model';

/** What the server asks for after a correct email + password. */
export interface SignInChallenge {
  /** The email the code was sent for; carried into the verify step. */
  email: string;
  /** Masked destination, e.g. "number ending 4471". */
  sentTo: string;
}

/**
 * What `signIn` resolves to. The fixture backend is a two-step flow (a code
 * challenge, then verification); the real backend's `login` mutation returns
 * tokens directly — there is no code-challenge endpoint. Both are valid
 * outcomes of "I sent credentials", so the port models both rather than one
 * repository faking a step the other doesn't have.
 */
export type SignInOutcome =
  | { readonly kind: 'signed-in'; readonly user: AdminUser }
  | { readonly kind: 'challenge'; readonly challenge: SignInChallenge };

/**
 * Port for authentication. Declared as an `abstract class` so it doubles as the
 * DI token (Angular resolves it structurally — no `InjectionToken` + interface
 * pair needed). `InMemoryAuthRepository` binds it today; `GraphqlAuthRepository`
 * is a drop-in replacement — same signatures, same `Observable` contract.
 */
export abstract class AuthRepository {
  /** Exchange credentials for either a challenge or a completed sign-in. */
  abstract signIn(email: string, password: string): Observable<SignInOutcome>;

  /** Step 2, only reached on a `'challenge'` outcome: exchange the code for the user. */
  abstract verifyCode(email: string, code: string): Observable<AdminUser>;

  /** Invalidates the session server-side. Local state is `AuthStore`'s job. */
  abstract signOut(): Observable<void>;
}
