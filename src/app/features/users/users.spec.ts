import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Observable, of, throwError } from 'rxjs';
import { ConsoleChrome } from '../../layouts/console-layout/console-chrome';
import { AccountRepository } from '../../core/api/ports/account-repository';
import {
  ACCOUNTS_FIXTURE,
  SUSPENDED_IDENTITIES,
} from '../../core/api/in-memory/in-memory-account-repository';
import { Account } from '../../core/models/account.model';
import { AccountsStore } from './accounts-store';
import { Users } from './users';

/**
 * The shipped fixture, answered synchronously — the specs assert on the real
 * account list, and nothing here waits on a timer (there is no zone.js to fake).
 */
class StubAccountRepository extends AccountRepository {
  private accounts: readonly Account[] = ACCOUNTS_FIXTURE;
  private readonly hidden = new Map<string, { name: string; email: string }>(SUSPENDED_IDENTITIES);

  override list(): Observable<readonly Account[]> {
    return of(this.accounts);
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

  private write(updated: Account): Observable<Account> {
    this.accounts = this.accounts.map((account) => (account.id === updated.id ? updated : account));
    return of(updated);
  }
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
  TestBed.inject(AccountsStore).setFilters({ q: name });
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
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Users],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        ConsoleChrome,
        AccountsStore,
        { provide: AccountRepository, useClass: StubAccountRepository },
      ],
    }).compileComponents();
  });

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

  it('narrows by role, by status and by search', () => {
    const fixture = open();
    const store = TestBed.inject(AccountsStore);

    store.setFilters({ role: 'organiser' });
    fixture.detectChanges();
    // One per market — every market has someone who runs it.
    expect(store.visible().length).toBe(7);

    store.setFilters({ role: null, q: 'mcnallyfarm.ie' });
    fixture.detectChanges();
    expect(store.visible().length).toBe(1);
    expect(text(fixture)).toContain('Tom McNally');

    store.setFilters({ q: 'nobody at all' });
    fixture.detectChanges();
    expect(text(fixture)).toContain('No accounts match those filters');
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
    const peter = store.items().find((account) => account.name === 'Peter Hanlon')!;

    store.suspend([peter], 'Repeated chargebacks');
    fixture.detectChanges();

    expect(store.suspendedCount()).toBe(3);
    expect(text(fixture)).toContain('318 accounts');
    find(fixture, 'Peter Hanlon');
    expect(rows(fixture).some((row) => row.textContent?.includes('Peter Hanlon'))).toBe(false);

    const suspended = store.items().find((account) => account.id === peter.id)!;
    expect(suspended.email).toBe('hidden after suspension');
    expect(suspended.suspendedNote).toContain('Repeated chargebacks');

    store.restore(suspended);
    fixture.detectChanges();

    expect(store.suspendedCount()).toBe(2);
    expect(rowFor(find(fixture, 'Peter Hanlon'), 'Peter Hanlon').textContent).toContain(
      'phanlon@outlook.com',
    );
  });

  it('restores an account suspended before this session', () => {
    const fixture = open();
    const store = TestBed.inject(AccountsStore);
    const closed = store.items().find((account) => account.status === 'suspended')!;

    store.restore(closed);
    fixture.detectChanges();

    const reopened = store.items().find((account) => account.id === closed.id)!;
    // The name the fixture hid comes back, rather than "Account #3004" sticking.
    expect(reopened.name).not.toContain('Account #');
    expect(reopened.email).not.toBe('hidden after suspension');
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

/** The list refusing to load — the screen has to say so, not sit blank. */
class FailingAccountRepository extends StubAccountRepository {
  override list(): Observable<readonly Account[]> {
    return throwError(() => new Error('The account list is unavailable right now.'));
  }
}

describe('Users when the list will not load', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Users],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        ConsoleChrome,
        AccountsStore,
        { provide: AccountRepository, useClass: FailingAccountRepository },
      ],
    }).compileComponents();
  });

  it('reports the error and offers a retry', () => {
    const fixture = open();

    expect(text(fixture)).toContain('The account list is unavailable right now.');
    expect(text(fixture)).toContain('Retry');
    expect(host(fixture).querySelector('table')).toBeNull();
  });
});
