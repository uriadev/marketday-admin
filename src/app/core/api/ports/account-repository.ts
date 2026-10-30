import { Observable } from 'rxjs';
import {
  Account,
  AccountDirectoryPage,
  AccountListQuery,
  AdminEmail,
  EmailPreview,
  EmailRecipient,
  EmailSenderOption,
} from '../../models/account.model';

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
  /**
   * One page of the list, narrowed and counted, with the platform-wide counts
   * the header and the menus read. Filters travel with the page rather than
   * being applied to the answer — the caller holds one page and could only
   * narrow that — and how much of the query reaches the server is each
   * implementation's business.
   */
  abstract list(query: AccountListQuery): Observable<AccountDirectoryPage>;

  /** Closes an account and records `reason` against it. */
  abstract suspend(id: string, reason: string): Observable<Account>;

  /** Re-opens a suspended account, restoring the name and email it hid. */
  abstract restore(id: string): Observable<Account>;

  /**
   * Emails the account a password-reset code. For an `invited` account —
   * created on someone's behalf and never signed in — this is how they get in.
   */
  abstract sendPasswordReset(email: string): Observable<void>;

  /**
   * The email `sendEmail` would deliver, rendered in the MarketDay template —
   * what the compose dialog shows beside the form.
   */
  abstract previewEmail(id: string, email: AdminEmail): Observable<EmailPreview>;

  /** Emails the account a message from the MarketDay team. */
  abstract sendEmail(id: string, email: AdminEmail): Observable<void>;

  /** The MarketDay mailboxes an email can go out from, for the compose dialog's From menu. */
  abstract emailSenders(): Observable<EmailSenderOption[]>;

  /**
   * The email `sendOutreachEmail` would deliver to `to`, an address with no
   * account behind it — rendered, not sent.
   */
  abstract previewOutreachEmail(to: EmailRecipient, email: AdminEmail): Observable<EmailPreview>;

  /**
   * Emails someone who is not on MarketDay yet — a vendor the team would like
   * to bring on. Nothing is looked up or stored.
   */
  abstract sendOutreachEmail(to: EmailRecipient, email: AdminEmail): Observable<void>;
}
