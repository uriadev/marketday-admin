import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AccountRepository } from '../../core/api/ports/account-repository';
import { PagedCollectionStore } from '../../core/state/paged-collection-store';
import { PageRequest } from '../../core/models/page.model';
import {
  Account,
  AccountDirectoryFacets,
  AccountDirectoryPage,
  AccountFilters,
  AccountRole,
  AccountStatus,
  EMPTY_ACCOUNT_FACETS,
  EMPTY_ACCOUNT_FILTERS,
  hasAccountFilters,
} from '../../core/models/account.model';

/**
 * Every account on the platform, in one list (design 1i). Provided at the
 * `/users` route, so it dies with the screen.
 *
 * Paged by the repository rather than in the browser: `items()` is the page on
 * screen, `total()` the rows behind the filters, and every page turn and
 * filter change is a fresh read (`PagedCollectionStore`). The header and the
 * Role and Status menus count every account, not the page, so those numbers
 * are the facets the repository hands back beside it.
 */
@Injectable()
export class AccountsStore extends PagedCollectionStore<Account, AccountFilters> {
  private readonly repo = inject(AccountRepository);

  private readonly _facets = signal<AccountDirectoryFacets>(EMPTY_ACCOUNT_FACETS);
  /** Set while a command is in flight, so the screen stops taking clicks. */
  private readonly _busy = signal(false);
  private readonly _commandError = signal<string | null>(null);

  readonly busy = this._busy.asReadonly();
  /** Why the last suspend, restore or reset was refused, or `null`. */
  readonly commandError = this._commandError.asReadonly();

  constructor() {
    super(EMPTY_ACCOUNT_FILTERS);
  }

  protected override fetchPage(
    filters: AccountFilters,
    page: PageRequest,
  ): Observable<AccountDirectoryPage> {
    return this.repo.list({ filters, page }).pipe(tap((result) => this._facets.set(result.facets)));
  }

  /* ── Selectors ─────────────────────────────────────────────────────────── */

  /** Accounts on the platform, whatever the filters narrow the table to. */
  readonly accountCount = computed(() => this._facets().accountCount);

  readonly suspendedCount = computed(() => this._facets().statusCounts.suspended);

  /** "318 accounts". */
  readonly heading = computed(() => {
    const total = this.accountCount();
    return `${total.toLocaleString('en-IE')} ${total === 1 ? 'account' : 'accounts'}`;
  });

  /**
   * "Shoppers, vendor staff, organisers and the MarketDay team · 2 suspended".
   * The roll-call is the point of this screen — one table, every kind of
   * account — so it is spelled out rather than left to the Role menu.
   */
  readonly summary = computed(() => {
    const parts = ['Shoppers, vendor staff, organisers and the MarketDay team'];
    const suspended = this.suspendedCount();
    if (suspended > 0) parts.push(`${suspended} suspended`);
    return parts.join(' · ');
  });

  roleCount(role: AccountRole): number {
    return this._facets().roleCounts[role];
  }

  statusCount(status: AccountStatus): number {
    return this._facets().statusCounts[status];
  }

  readonly hasActiveFilters = computed(() => hasAccountFilters(this.filters()));

  /**
   * Nothing matched, but there are accounts — the state that offers a way out.
   * Read from the counts, because the rows to compare are on pages that were
   * never fetched.
   */
  readonly isFilteredEmpty = computed(
    () => !this.isLoading() && this.total() === 0 && this.accountCount() > 0,
  );

  /* ── Commands ──────────────────────────────────────────────────────────── */

  /**
   * Closes accounts and records why. Not optimistic: suspension redacts a name
   * and an email, and showing that before the server has agreed would be a
   * change an admin cannot tell apart from a real one.
   *
   * `onDone` gets the accounts the server actually suspended, once every
   * request has answered — the screen confirms those and no more, since a
   * refusal lands in {@link commandError}.
   */
  suspend(
    accounts: readonly Account[],
    reason: string,
    onDone: (suspended: readonly Account[]) => void = () => undefined,
  ): void {
    this.each(accounts, (account) => this.repo.suspend(account.id, reason), onDone);
  }

  restore(
    account: Account,
    onDone: (restored: readonly Account[]) => void = () => undefined,
  ): void {
    this.each([account], (target) => this.repo.restore(target.id), onDone);
  }

  /** `onSent` runs only once the server has taken the request. */
  sendPasswordReset(account: Account, onSent: () => void = () => undefined): void {
    this._busy.set(true);
    this._commandError.set(null);
    this.repo.sendPasswordReset(account.email).subscribe({
      next: () => {
        this._busy.set(false);
        onSent();
      },
      error: (cause: unknown) => {
        this._commandError.set(
          cause instanceof Error ? cause.message : 'The reset email could not be sent.',
        );
        this._busy.set(false);
      },
    });
  }

  /**
   * Runs one command per account and swaps each row in as it comes back, so
   * the redaction shows the moment the server agrees. Once the last answer is
   * in, the page is read again: a suspended row may no longer match an
   * "Active" filter, and the header's count moved — both are the server's to
   * say, not something to patch up here.
   */
  private each(
    accounts: readonly Account[],
    command: (account: Account) => Observable<Account>,
    onDone: (updated: readonly Account[]) => void,
  ): void {
    if (accounts.length === 0) return;
    this._busy.set(true);
    this._commandError.set(null);

    const updated: Account[] = [];
    let outstanding = accounts.length;
    const settle = () => {
      outstanding -= 1;
      if (outstanding > 0) return;
      this._busy.set(false);
      if (updated.length > 0) this.load();
      onDone(updated);
    };

    for (const account of accounts) {
      command(account).subscribe({
        next: (row) => {
          updated.push(row);
          this.replaceAll(this.items().map((item) => (item.id === row.id ? row : item)));
          settle();
        },
        error: (cause: unknown) => {
          this._commandError.set(
            cause instanceof Error ? cause.message : 'That account could not be updated.',
          );
          settle();
        },
      });
    }
  }
}
