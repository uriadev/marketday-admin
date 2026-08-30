import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { AccountRepository } from '../../core/api/ports/account-repository';
import { CollectionStore } from '../../core/state/collection-store';
import {
  Account,
  AccountFilters,
  AccountRole,
  AccountStatus,
  EMPTY_ACCOUNT_FILTERS,
} from '../../core/models/account.model';

/**
 * Every account on the platform, in one list (design 1i). Provided at the
 * `/users` route, so it dies with the screen.
 *
 * Like the other directories, the fixture backend hands over the whole list and
 * this narrows it client-side: `items()` is every account — which is what the
 * header counts — and `visible()` is what the table pages through.
 */
@Injectable()
export class AccountsStore extends CollectionStore<Account, AccountFilters> {
  private readonly repo = inject(AccountRepository);

  /** Set while a command is in flight, so the screen stops taking clicks. */
  private readonly _busy = signal(false);
  private readonly _commandError = signal<string | null>(null);

  readonly busy = this._busy.asReadonly();
  /** Why the last suspend or restore was refused, or `null`. */
  readonly commandError = this._commandError.asReadonly();

  constructor() {
    super(EMPTY_ACCOUNT_FILTERS);
  }

  protected override fetch(): Observable<readonly Account[]> {
    return this.repo.list();
  }

  /* ── Selectors ─────────────────────────────────────────────────────────── */

  readonly suspendedCount = computed(
    () => this.items().filter((account) => account.status === 'suspended').length,
  );

  /** "318 accounts". */
  readonly heading = computed(() => {
    const total = this.items().length;
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
    return this.items().filter((account) => account.role === role).length;
  }

  statusCount(status: AccountStatus): number {
    return this.items().filter((account) => account.status === status).length;
  }

  readonly hasActiveFilters = computed(() => {
    const { q, role, status, signedUp } = this.filters();
    return q.trim() !== '' || role !== null || status !== null || signedUp !== 'any';
  });

  /**
   * The rows the table pages through, most recently active first. The three
   * menus narrow together, so "Vendor staff" plus "Suspended" means exactly
   * that.
   */
  readonly visible = computed(() => {
    const { q, role, status, signedUp } = this.filters();
    const needle = q.trim().toLowerCase();

    return this.items()
      .filter((account) => {
        if (role !== null && account.role !== role) return false;
        if (status !== null && account.status !== status) return false;
        if (signedUp === 'last30' && account.signedUpBucket !== 'last30') return false;
        if (signedUp === 'thisYear' && account.signedUpBucket === 'earlier') return false;
        if (signedUp === 'earlier' && account.signedUpBucket !== 'earlier') return false;
        if (needle === '') return true;
        // The design's placeholder promises name or email, and nothing else.
        return (
          account.name.toLowerCase().includes(needle) ||
          account.email.toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => a.lastActiveRank - b.lastActiveRank);
  });

  readonly isFilteredEmpty = computed(
    () => !this.isLoading() && this.visible().length === 0 && this.items().length > 0,
  );

  /* ── Commands ──────────────────────────────────────────────────────────── */

  /**
   * Closes accounts and records why. Not optimistic: suspension redacts a name
   * and an email, and showing that before the server has agreed would be a
   * change an admin cannot tell apart from a real one.
   */
  suspend(accounts: readonly Account[], reason: string): void {
    this.each(accounts, (account) => this.repo.suspend(account.id, reason));
  }

  restore(account: Account): void {
    this.each([account], (target) => this.repo.restore(target.id));
  }

  /** Runs one command per account and swaps in each row as it comes back. */
  private each(
    accounts: readonly Account[],
    command: (account: Account) => Observable<Account>,
  ): void {
    if (accounts.length === 0) return;
    this._busy.set(true);
    this._commandError.set(null);

    let outstanding = accounts.length;
    const done = () => {
      outstanding -= 1;
      if (outstanding === 0) this._busy.set(false);
    };

    for (const account of accounts) {
      command(account).subscribe({
        next: (updated) => {
          this.replaceAll(this.items().map((row) => (row.id === updated.id ? updated : row)));
          done();
        },
        error: (cause: unknown) => {
          this._commandError.set(
            cause instanceof Error ? cause.message : 'That account could not be updated.',
          );
          done();
        },
      });
    }
  }
}
