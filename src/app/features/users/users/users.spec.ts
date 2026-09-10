import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Observable, of, throwError } from 'rxjs';
import { ConsoleChrome } from '../../../layouts/console-layout/console-chrome';
import { AccountRepository } from '../../../core/api/ports/account-repository';
import {
  ACCOUNTS_FIXTURE,
  SUSPENDED_IDENTITIES,
  accountDirectoryPage,
} from '../../../core/api/in-memory/in-memory-account-repository';
import {
  Account,
  AccountDirectoryPage,
  AccountListQuery,
} from '../../../core/models/account.model';
import { Notifications } from '../../../core/notifications/notifications';
import { AccountsStore } from '../accounts-store';
import { Users } from './users';

/**
 * The shipped fixture, answered synchronously — the specs assert on the real
 * account list, and nothing here waits on a timer (there is no zone.js to fake).
 * Pages the way the fixture repository does, so what a page holds and what the
 * header counts come from the same place they will in the app.
 */
class StubAccountRepository extends AccountRepository {
  private accounts: readonly Account[] = ACCOUNTS_FIXTURE;
  private readonly hidden = new Map<string, { name: string; email: string }>(SUSPENDED_IDENTITIES);
  /** Every address a reset was asked for. */
  readonly resets: string[] = [];

  override list(query: AccountListQuery): Observable<AccountDirectoryPage> {
    return of(accountDirectoryPage(this.accounts, query));
  }

  override suspend(id: string, reason: string): Observable<Account> {
    const account = this.accounts.find((candidate) => candidate.id === id);
    if (!account || account.status === 'suspended') {
      return throwError(() => new Error('That account is already suspended.'));
    }
    this.hidden.set(id, { name: account.name, email: account.email });
    return this.write({
      ...account,
      name: `Account #${id.replace('acc-', '')}`,
      email: 'hidden after suspension',
      attachedLink: null,
      status: 'suspended',
      suspendedNote: `${reason} · suspended just now`,
    });
  }

  override restore(id: string): Observable<Account> {
    const account = this.accounts.find((candidate) => candidate.id === id);
    if (!account || account.status !== 'suspended') {
      return throwError(() => new Error('That account is not suspended.'));
    }
    const was = this.hidden.get(id);
    return this.write({
      ...account,
      name: was?.name ?? account.name,
      email: was?.email ?? account.email,
      status: 'active',
      suspendedNote: null,
    });
  }

  override sendPasswordReset(email: string): Observable<void> {
    this.resets.push(email);
    return of(undefined);
  }

  private write(updated: Account): Observable<Account> {
    this.accounts = this.accounts.map((account) => (account.id === updated.id ? updated : account));
    return of(updated);
  }
}

/** Refuses every suspension, the way a backend guarding its own rules would. */
class RefusingAccountRepository extends StubAccountRepository {
  override suspend(): Observable<Account> {
    return throwError(() => new Error('You cannot suspend your own account.'));
  }
}

const notifications = { success: vi.fn(), info: vi.fn(), error: vi.fn() };

function configure(repository: typeof StubAccountRepository) {
  notifications.success.mockReset();
  return TestBed.configureTestingModule({
    imports: [Users],
    providers: [
      provideRouter([]),
      provideNoopAnimations(),
      ConsoleChrome,
      AccountsStore,
      { provide: AccountRepository, useClass: repository },
      { provide: Notifications, useValue: notifications },
    ],
  }).compileComponents();
}

/** Any account in the fixture, by the name it was seeded with. */
function seeded(name: string): Account {
  const account = ACCOUNTS_FIXTURE.find((candidate) => candidate.name === name);
  expect(account).toBeDefined();
  return account!;
}

function open() {
  const fixture = TestBed.createComponent(Users);
  fixture.detectChanges();
  return fixture;
}

function host(fixture: { nativeElement: unknown }): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function text(fixture: { nativeElement: unknown }): string {
  return host(fixture).textContent ?? '';
}

function rows(fixture: { nativeElement: unknown }): HTMLElement[] {
  return Array.from(host(fixture).querySelectorAll('tbody tr'));
}

/** Narrows the table to one person, the way an admin looking them up would. */
function find(fixture: { nativeElement: unknown; detectChanges(): void }, name: string) {
  TestBed.inject(AccountsStore).setFilters({ q: name, status: null });
  fixture.detectChanges();
  return fixture;
}

function rowFor(fixture: { nativeElement: unknown }, name: string): HTMLElement {
  const match = rows(fixture).find((row) => row.textContent?.includes(name));
  expect(match).toBeDefined();
  return match!;
}

function menuItem(label: string): HTMLButtonElement {
  const match = Array.from(document.querySelectorAll('button.mat-mdc-menu-item')).find(
    (candidate) => candidate.textContent?.trim().startsWith(label),
  );
  expect(match).toBeDefined();
  return match as HTMLButtonElement;
}

/** Opens a row's overflow menu, which renders in an overlay on the document. */
function openRowMenu(fixture: { nativeElement: unknown; detectChanges(): void }, name: string) {
  const trigger = rowFor(fixture, name).querySelector('.mat-mdc-icon-button') as HTMLButtonElement;
  trigger.click();
  fixture.detectChanges();
}

describe('Users', () => {
  beforeEach(() => configure(StubAccountRepository));

  it('counts every account and says who is in the list', () => {
    const fixture = open();

    expect(text(fixture)).toContain('318 accounts');
    expect(text(fixture)).toContain(
      'Shoppers, vendor staff, organisers and the MarketDay team · 2 suspended',
    );
  });

  it('puts everyone in one table with a role column', () => {
    const fixture = open();

    expect(rowFor(find(fixture, 'Niamh Brady'), 'Niamh Brady').textContent).toContain('Shopper');

    const tom = rowFor(find(fixture, 'Tom McNally'), 'Tom McNally');
    expect(tom.textContent).toContain('Vendor staff');
    expect(tom.textContent).toContain('McNally Family Farm');

    expect(rowFor(find(fixture, 'Gráinne Doyle'), 'Gráinne Doyle').textContent).toContain(
      'Organiser',
    );

    const dara = rowFor(find(fixture, 'Dara Ó Sé'), 'Dara Ó Sé');
    expect(dara.textContent).toContain('Support agent');
    expect(dara.textContent).toContain('MarketDay team');
  });

  it('links an account through to whatever it is attached to', () => {
    const fixture = open();

    expect(
      rowFor(find(fixture, 'Tom McNally'), 'Tom McNally').querySelector(
        'a[href="/vendors/mcnally-family-farm"]',
      ),
    ).not.toBeNull();
    expect(
      rowFor(find(fixture, 'Gráinne Doyle'), 'Gráinne Doyle').querySelector(
        'a[href="/markets/temple-bar"]',
      ),
    ).not.toBeNull();
    // A shopper belongs to nobody, so there is nothing to open.
    expect(rowFor(find(fixture, 'Niamh Brady'), 'Niamh Brady').querySelector('a')).toBeNull();
  });

  it('hides a suspended account’s name and email', () => {
    const fixture = open();
    const store = TestBed.inject(AccountsStore);

    store.setFilters({ status: 'suspended' });
    fixture.detectChanges();

    expect(rows(fixture).length).toBe(2);
    expect(text(fixture)).toContain('hidden after suspension');
    expect(text(fixture)).toContain('Suspended');
    expect(text(fixture)).not.toContain('Rob Whelan');
  });

  it('pages 25 at a time rather than showing all 318', () => {
    const fixture = open();

    expect(rows(fixture).length).toBe(25);
    expect(text(fixture)).toContain('1 – 25 of 318');
  });

  it('asks for the next page rather than slicing one it already holds', () => {
    const fixture = open();
    const store = TestBed.inject(AccountsStore);
    const first = store.items().map((account) => account.id);

    store.setPage(1, 25);
    fixture.detectChanges();

    expect(text(fixture)).toContain('26 – 50 of 318');
    expect(store.items().some((account) => first.includes(account.id))).toBe(false);
  });

  it('narrows by role, by status and by search', () => {
    const fixture = open();
    const store = TestBed.inject(AccountsStore);

    store.setFilters({ role: 'organiser' });
    fixture.detectChanges();
    // One per market — every market has someone who runs it.
    expect(store.total()).toBe(7);

    store.setFilters({ role: null, q: 'mcnallyfarm.ie' });
    fixture.detectChanges();
    expect(store.total()).toBe(1);
    expect(text(fixture)).toContain('Tom McNally');

    store.setFilters({ q: 'nobody at all' });
    fixture.detectChanges();
    expect(text(fixture)).toContain('No accounts match those filters');
  });

  it('counts each menu entry across every account, not the page', () => {
    open();
    const store = TestBed.inject(AccountsStore);

    store.setFilters({ role: 'shopper' });
    // Narrowing the table leaves the menus describing the whole platform.
    expect(store.roleCount('organiser')).toBe(7);
    expect(store.statusCount('suspended')).toBe(2);
    expect(store.heading()).toBe('318 accounts');
  });

  it('keeps destructive actions in the row menu, behind a reason', () => {
    const fixture = open();

    openRowMenu(find(fixture, 'Peter Hanlon'), 'Peter Hanlon');
    menuItem('Suspend account').click();
    fixture.detectChanges();

    // The dialog gates it — nothing has changed yet.
    expect(TestBed.inject(AccountsStore).suspendedCount()).toBe(2);
    const dialog = document.querySelector('md-suspend-account-dialog');
    expect(dialog?.textContent).toContain('Peter Hanlon');
    expect(dialog?.textContent).toContain('written to the audit log');
  });

  it('redacts the row once a suspension goes through, and puts it back', () => {
    const fixture = open();
    const store = TestBed.inject(AccountsStore);
    const peter = seeded('Peter Hanlon');

    let suspended: readonly Account[] = [];
    store.suspend([peter], 'Repeated chargebacks', (done) => (suspended = done));
    fixture.detectChanges();

    // The counts are re-read, not patched.
    expect(store.suspendedCount()).toBe(3);
    expect(text(fixture)).toContain('318 accounts');
    find(fixture, 'Peter Hanlon');
    expect(rows(fixture).some((row) => row.textContent?.includes('Peter Hanlon'))).toBe(false);

    expect(suspended.map((account) => account.id)).toEqual([peter.id]);
    expect(suspended[0]!.email).toBe('hidden after suspension');
    expect(suspended[0]!.suspendedNote).toContain('Repeated chargebacks');

    store.restore(suspended[0]!);
    fixture.detectChanges();

    expect(store.suspendedCount()).toBe(2);
    expect(rowFor(find(fixture, 'Peter Hanlon'), 'Peter Hanlon').textContent).toContain(
      'phanlon@outlook.com',
    );
  });

  it('restores an account suspended before this session', () => {
    const fixture = open();
    const store = TestBed.inject(AccountsStore);
    store.setFilters({ status: 'suspended' });
    fixture.detectChanges();
    const closed = store.items()[0]!;

    let reopened: Account | undefined;
    store.restore(closed, (done) => (reopened = done[0]));
    fixture.detectChanges();

    // The name the fixture hid comes back, rather than "Account #3004" sticking.
    expect(reopened?.name).not.toContain('Account #');
    expect(reopened?.email).not.toBe('hidden after suspension');
    // Re-read under the same filter, it has left the suspended list.
    expect(store.items().some((account) => account.id === closed.id)).toBe(false);
  });

  it('sends a password reset from the row menu', () => {
    const fixture = open();

    openRowMenu(find(fixture, 'Peter Hanlon'), 'Peter Hanlon');
    menuItem('Send password reset').click();
    fixture.detectChanges();

    expect((TestBed.inject(AccountRepository) as StubAccountRepository).resets).toEqual([
      'phanlon@outlook.com',
    ]);
    expect(notifications.success).toHaveBeenCalledWith(
      'Password reset sent to phanlon@outlook.com.',
    );
  });

  it('offers no password reset to a suspended account', () => {
    const fixture = open();
    TestBed.inject(AccountsStore).setFilters({ status: 'suspended' });
    fixture.detectChanges();

    const [first] = rows(fixture);
    (first!.querySelector('.mat-mdc-icon-button') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(menuItem('Send password reset').disabled).toBe(true);
  });

  it('selects a page of rows and offers to suspend only what is still open', () => {
    const fixture = open();
    const store = TestBed.inject(AccountsStore);
    store.setFilters({ status: 'suspended' });
    fixture.detectChanges();

    const header = host(fixture).querySelector('thead mat-checkbox input') as HTMLInputElement;
    header.click();
    fixture.detectChanges();

    expect(text(fixture)).toContain('2 selected on this page');
    // Everything picked is already closed, so there is nothing to suspend.
    const suspend = Array.from(host(fixture).querySelectorAll('button')).find((button) =>
      button.textContent?.trim().startsWith('Suspend'),
    ) as HTMLButtonElement;
    expect(suspend.disabled).toBe(true);
  });

  it('drops a selection when the filters move under it', () => {
    const fixture = open();

    const first = host(fixture).querySelector('tbody mat-checkbox input') as HTMLInputElement;
    first.click();
    fixture.detectChanges();
    expect(text(fixture)).toContain('1 selected on this page');

    TestBed.inject(AccountsStore).setFilters({ role: 'organiser' });
    fixture.detectChanges();

    expect(text(fixture)).not.toContain('selected on this page');
  });

  it('spells out where destructive actions live', () => {
    const fixture = open();

    expect(text(fixture)).toContain(
      'The row menu is the only place destructive actions live. Suspending always asks for a reason and writes to the audit log.',
    );
  });
});

describe('Users when a suspension is refused', () => {
  beforeEach(() => configure(RefusingAccountRepository));

  it('shows the server’s reason and confirms nothing', () => {
    const fixture = open();
    const store = TestBed.inject(AccountsStore);

    let suspended: readonly Account[] | undefined;
    store.suspend([seeded('Peter Hanlon')], 'Repeated chargebacks', (done) => (suspended = done));
    fixture.detectChanges();

    expect(text(fixture)).toContain('You cannot suspend your own account.');
    expect(suspended).toEqual([]);
    expect(store.suspendedCount()).toBe(2);
    expect(notifications.success).not.toHaveBeenCalled();
  });
});

/** The list refusing to load — the screen has to say so, not sit blank. */
class FailingAccountRepository extends StubAccountRepository {
  override list(): Observable<AccountDirectoryPage> {
    return throwError(() => new Error('The account list is unavailable right now.'));
  }
}

describe('Users when the list will not load', () => {
  beforeEach(() => configure(FailingAccountRepository));

  it('reports the error and offers a retry', () => {
    const fixture = open();

    expect(text(fixture)).toContain('The account list is unavailable right now.');
    expect(text(fixture)).toContain('Retry');
    expect(host(fixture).querySelector('table')).toBeNull();
  });
});
