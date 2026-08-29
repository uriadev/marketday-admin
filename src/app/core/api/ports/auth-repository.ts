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
 * Port for authentication. Declared as an `abstract class` so it doubles as the
 * DI token (Angular resolves it structurally — no `InjectionToken` + interface
 * pair needed). `InMemoryAuthRepository` binds it today; a `GraphqlAuthRepository`
 * is a drop-in replacement later — same signatures, same `Observable` contract.
 */
export abstract class AuthRepository {
  /** Step 1: exchange credentials for a verification challenge. */
  abstract signIn(email: string, password: string): Observable<SignInChallenge>;

  /** Step 2: exchange the emailed/texted code for the authenticated user. */
  abstract verifyCode(email: string, code: string): Observable<AdminUser>;
}
