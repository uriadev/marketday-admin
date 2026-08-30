import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ACCOUNTS_FIXTURE } from '../../core/api/in-memory/in-memory-account-repository';
import { Account } from '../../core/models/account.model';
import { SuspendAccountDialog, SuspendAccountDialogData } from './suspend-account-dialog';

const OPEN_ACCOUNTS: readonly Account[] = ACCOUNTS_FIXTURE.filter(
  (account) => account.status === 'active',
);

const closed: string[] = [];
const ref = { close: (reason?: string) => closed.push(reason ?? '') };

function open(accounts: readonly Account[]) {
  TestBed.overrideProvider(MAT_DIALOG_DATA, { useValue: { accounts } });
  const fixture = TestBed.createComponent(SuspendAccountDialog);
  fixture.detectChanges();
  return fixture;
}

function host(fixture: { nativeElement: unknown }): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function confirm(fixture: { nativeElement: unknown; detectChanges(): void }) {
  const button = Array.from(host(fixture).querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.trim().startsWith('Suspend'),
  ) as HTMLButtonElement;
  button.click();
  fixture.detectChanges();
}

describe('SuspendAccountDialog', () => {
  beforeEach(async () => {
    closed.length = 0;
    const data: SuspendAccountDialogData = { accounts: OPEN_ACCOUNTS.slice(0, 1) };
    await TestBed.configureTestingModule({
      imports: [SuspendAccountDialog],
      providers: [
        provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: ref },
      ],
    }).compileComponents();
  });

  it('names the one person, and says what suspension takes away', () => {
    const fixture = open(OPEN_ACCOUNTS.slice(0, 1));
    const text = host(fixture).textContent ?? '';

    expect(text).toContain('Suspend this account');
    expect(text).toContain(OPEN_ACCOUNTS[0]!.name);
    expect(text).toContain('signed out and unable to sign in again');
    expect(text).toContain('written to the audit log');
  });

  it('counts them instead once it is more than one', () => {
    const fixture = open(OPEN_ACCOUNTS.slice(0, 4));
    const text = host(fixture).textContent ?? '';

    expect(text).toContain('Suspend 4 accounts');
    expect(text).toContain('4 accounts will be signed out');
  });

  it('will not suspend without a reason — it is what an appeal is answered from', () => {
    const fixture = open(OPEN_ACCOUNTS.slice(0, 1));

    confirm(fixture);

    expect(closed).toEqual([]);
    expect(host(fixture).textContent).toContain('Say why the account is being suspended');
  });

  it('hands the reason back once one is given', () => {
    const fixture = open(OPEN_ACCOUNTS.slice(0, 1));

    const reason = host(fixture).querySelector('textarea') as HTMLTextAreaElement;
    reason.value = '  Chargeback fraud across three markets.  ';
    reason.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    confirm(fixture);

    expect(closed).toEqual(['Chargeback fraud across three markets.']);
  });
});
