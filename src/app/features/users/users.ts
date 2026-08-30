import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ConsoleChrome } from '../../layouts/console-layout/console-chrome';
import { Avatar } from '../../shared/components/avatar/avatar';
import { EmptyState } from '../../shared/components/empty-state/empty-state';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { PillTone, StatusPill } from '../../shared/components/status-pill/status-pill';
import {
  ACCOUNT_ROLES,
  ACCOUNT_ROLE_LABELS,
  ACCOUNT_STATUSES,
  ACCOUNT_STATUS_LABELS,
  Account,
  AccountFilters,
  AccountRole,
  AccountStatus,
  SIGN_UP_FILTERS,
  SignUpFilter,
} from '../../core/models/account.model';
import { Notifications } from '../../core/notifications/notifications';
import { AccountsStore } from './accounts-store';
import { SuspendAccountDialog, SuspendAccountDialogData } from './suspend-account-dialog';

/**
 * Everyone with an account, in one table (design 1i).
 *
 * One table rather than a tab per kind: a support agent looking someone up has
 * an email, not a category, and the role column is what answers "what is this
 * person to us". Destructive actions live only in the row menu, and suspending
 * always goes through a reason.
 */
@Component({
  selector: 'md-users',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    Avatar,
    EmptyState,
    PageHeader,
    StatusPill,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatTableModule,
    MatTooltipModule,
  ],
  templateUrl: './users.html',
  styleUrl: './users.css',
})
export class Users implements OnInit {
  /** Filters arrive as query params (§7); an absent one binds as `undefined`. */
  readonly q = input<string>();
  readonly role = input<string>();
  readonly status = input<string>();
  readonly signedUp = input<string>();

  protected readonly store = inject(AccountsStore);
  protected readonly chrome = inject(ConsoleChrome);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly notifications = inject(Notifications);

  protected readonly roles = ACCOUNT_ROLES;
  protected readonly roleLabels = ACCOUNT_ROLE_LABELS;
  protected readonly statuses = ACCOUNT_STATUSES;
  protected readonly statusLabels = ACCOUNT_STATUS_LABELS;
  protected readonly signUpFilters = SIGN_UP_FILTERS;
  protected readonly columns = [
    'select',
    'name',
    'role',
    'attached',
    'lastActive',
    'status',
    'actions',
  ];

  protected readonly filters = computed<AccountFilters>(() => ({
    q: this.q() ?? '',
    role: this.asRole(this.role()),
    status: this.asStatus(this.status()),
    signedUp: this.asSignUp(this.signedUp()),
  }));

  /** Page position and selection are view state, not something to link to. */
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = signal(25);
  private readonly selectedIds = signal<ReadonlySet<string>>(new Set());

  protected readonly page = computed(() => {
    const start = this.pageIndex() * this.pageSize();
    return this.store.visible().slice(start, start + this.pageSize());
  });

  constructor() {
    // The URL is the source of truth; the store follows it.
    effect(() => this.store.setFilters(this.filters()));
    // A narrower list can be shorter than the page you were on, and a row you
    // picked can drop out of view — a hidden selection is a trap.
    effect(() => {
      this.store.visible();
      this.pageIndex.set(0);
      this.selectedIds.set(new Set());
    });
  }

  ngOnInit(): void {
    this.store.load();
  }

  /* ── Filters ───────────────────────────────────────────────────────────── */

  protected setParam(patch: Record<string, string | null>): void {
    void this.router.navigate([], {
      queryParams: patch,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected clearFilters(): void {
    this.setParam({ q: null, role: null, status: null, signedUp: null });
  }

  protected onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.setParam({ q: value === '' ? null : value });
  }

  protected setRole(role: AccountRole | null): void {
    this.setParam({ role });
  }

  protected setStatus(status: AccountStatus | null): void {
    this.setParam({ status });
  }

  protected setSignedUp(signedUp: SignUpFilter): void {
    this.setParam({ signedUp: signedUp === 'any' ? null : signedUp });
  }

  protected readonly roleLabel = computed(() => {
    const role = this.filters().role;
    return role === null ? 'Role' : ACCOUNT_ROLE_LABELS[role];
  });

  protected readonly statusLabel = computed(() => {
    const status = this.filters().status;
    return status === null ? 'Status' : ACCOUNT_STATUS_LABELS[status];
  });

  protected readonly signedUpLabel = computed(() => {
    const chosen = this.filters().signedUp;
    if (chosen === 'any') return 'Signed up';
    return SIGN_UP_FILTERS.find((option) => option.value === chosen)?.label ?? 'Signed up';
  });

  protected onPage(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
    this.selectedIds.set(new Set());
  }

  /* ── Selection ─────────────────────────────────────────────────────────── */

  /** Selection covers the page on screen, never rows you cannot see. */
  protected readonly selected = computed(() => {
    const ids = this.selectedIds();
    return this.page().filter((account) => ids.has(account.id));
  });

  protected readonly allOnPageSelected = computed(
    () => this.page().length > 0 && this.selected().length === this.page().length,
  );

  protected readonly someOnPageSelected = computed(
    () => this.selected().length > 0 && !this.allOnPageSelected(),
  );

  protected isSelected(account: Account): boolean {
    return this.selectedIds().has(account.id);
  }

  protected toggle(account: Account): void {
    this.selectedIds.update((ids) => {
      const next = new Set(ids);
      if (!next.delete(account.id)) next.add(account.id);
      return next;
    });
  }

  protected togglePage(): void {
    const all = this.allOnPageSelected();
    this.selectedIds.set(all ? new Set() : new Set(this.page().map((account) => account.id)));
  }

  protected clearSelection(): void {
    this.selectedIds.set(new Set());
  }

  /** Only open accounts can be suspended, so that is what the bar acts on. */
  protected readonly suspendable = computed(() =>
    this.selected().filter((account) => account.status !== 'suspended'),
  );

  /* ── Rows ──────────────────────────────────────────────────────────────── */

  /** The row's cells read a loose `any`, so the lookups happen here instead. */
  protected roleName(account: Account): string {
    return ACCOUNT_ROLE_LABELS[account.role];
  }

  protected statusName(account: Account): string {
    return ACCOUNT_STATUS_LABELS[account.status];
  }

  protected statusTone(account: Account): PillTone {
    if (account.status === 'active') return 'positive';
    return account.status === 'invited' ? 'warn' : 'alert';
  }

  /* ── Commands ──────────────────────────────────────────────────────────── */

  protected suspend(accounts: readonly Account[]): void {
    if (accounts.length === 0) return;
    const data: SuspendAccountDialogData = { accounts };
    this.dialog
      .open<SuspendAccountDialog, SuspendAccountDialogData, string>(SuspendAccountDialog, {
        data,
        width: '480px',
      })
      .afterClosed()
      .subscribe((reason) => {
        if (!reason) return;
        this.store.suspend(accounts, reason);
        this.clearSelection();
        this.notifications.success(
          accounts.length === 1
            ? `${accounts[0]!.name} is suspended.`
            : `${accounts.length} accounts are suspended.`,
        );
      });
  }

  protected restore(account: Account): void {
    this.store.restore(account);
    this.notifications.success('The account is open again.');
  }

  /* ── Query-param parsing ───────────────────────────────────────────────── */

  private asRole(value: string | undefined): AccountRole | null {
    return ACCOUNT_ROLES.includes(value as AccountRole) ? (value as AccountRole) : null;
  }

  private asStatus(value: string | undefined): AccountStatus | null {
    return ACCOUNT_STATUSES.includes(value as AccountStatus) ? (value as AccountStatus) : null;
  }

  private asSignUp(value: string | undefined): SignUpFilter {
    return SIGN_UP_FILTERS.some((option) => option.value === value)
      ? (value as SignUpFilter)
      : 'any';
  }
}
