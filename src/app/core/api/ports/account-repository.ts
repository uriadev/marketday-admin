import { Observable } from 'rxjs';
import { Account } from '../../models/account.model';

/**
 * Port for every account that can sign in to anything MarketDay runs (design
 * 1i) — shoppers, vendor staff, organisers and the platform team in one list,
 * because "who is this person and what can they reach" is one question.
 *
 * The two commands are the two destructive things the design puts behind the
 * row menu. `suspend` takes a reason because the design requires one: it is
 * what gets written to the audit log and what an appeal is answered from.
 */
export abstract class AccountRepository {
  abstract list(): Observable<readonly Account[]>;

  /** Closes an account and records `reason` against it. */
  abstract suspend(id: string, reason: string): Observable<Account>;

  /** Re-opens a suspended account, restoring the name and email it hid. */
  abstract restore(id: string): Observable<Account>;
}
