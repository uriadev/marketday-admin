import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MatDialog } from '@angular/material/dialog';
import { Observable, Subject, of, throwError } from 'rxjs';
import { PasskeyRepository } from '../../../core/api/ports/passkey-repository';
import { PasskeyCancelledError, WebAuthn } from '../../../core/auth/webauthn';
import { Passkey } from '../../../core/models/passkey.model';
import { Notifications } from '../../../core/notifications/notifications';
import { PasskeyNameDialog } from '../passkey-name-dialog/passkey-name-dialog';
import { RemovePasskeyDialog } from '../remove-passkey-dialog/remove-passkey-dialog';
import { SecurityFacade } from '../security-facade';
import { Security } from './security';

const MACBOOK: Passkey = {
  id: 'pk-1',
  name: 'MacBook',
  synced: true,
  createdAt: '2026-09-01T10:00:00.000Z',
  lastUsedAt: '2026-09-09T08:30:00.000Z',
};

const YUBIKEY: Passkey = {
  id: 'pk-2',
  name: 'YubiKey',
  synced: false,
  createdAt: '2026-09-02T10:00:00.000Z',
  lastUsedAt: null,
};

describe('Security', () => {
  let repo: {
    list: ReturnType<typeof vi.fn<() => Observable<Passkey[]>>>;
    register: ReturnType<typeof vi.fn<() => Observable<Passkey>>>;
    rename: ReturnType<typeof vi.fn<(id: string, name: string) => Observable<Passkey>>>;
    remove: ReturnType<typeof vi.fn<(id: string) => Observable<void>>>;
  };
  let registered$: Subject<Passkey>;
  /** What the next dialog closes with. */
  let dialogResult: unknown;
  let open: ReturnType<typeof vi.fn>;
  let notifications: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  let supported: boolean;

  beforeEach(async () => {
    registered$ = new Subject<Passkey>();
    repo = {
      list: vi.fn(() => of([MACBOOK, YUBIKEY])),
      register: vi.fn(() => registered$.asObservable()),
      rename: vi.fn((id: string, name: string) =>
        of({ ...[MACBOOK, YUBIKEY].find((p) => p.id === id)!, name }),
      ),
      remove: vi.fn(() => of(undefined)),
    };
    dialogResult = undefined;
    open = vi.fn(() => ({ afterClosed: () => of(dialogResult) }));
    notifications = { success: vi.fn(), error: vi.fn() };
    supported = true;

    await TestBed.configureTestingModule({
      imports: [Security],
      providers: [
        provideNoopAnimations(),
        SecurityFacade,
        { provide: PasskeyRepository, useValue: repo },
        { provide: MatDialog, useValue: { open } },
        { provide: Notifications, useValue: notifications },
        { provide: WebAuthn, useValue: { isSupported: () => supported } },
      ],
    }).compileComponents();
  });

  async function render() {
    const fixture = TestBed.createComponent(Security);
    await fixture.whenStable();
    return fixture;
  }

  const text = (fixture: Awaited<ReturnType<typeof render>>) =>
    (fixture.nativeElement as HTMLElement).textContent ?? '';

  const addButton = (fixture: Awaited<ReturnType<typeof render>>) =>
    [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Add a passkey'),
    )!;

  it('lists each passkey with where it lives and when it was last used', async () => {
    const fixture = await render();

    expect(text(fixture)).toContain('MacBook');
    expect(text(fixture)).toContain('Synced');
    expect(text(fixture)).toContain('Last used 9 Sep 2026');
    expect(text(fixture)).toContain('YubiKey');
    expect(text(fixture)).toContain('This device');
    expect(text(fixture)).toContain('Not used yet');
  });

  it('says so when there are none yet', async () => {
    repo.list.mockReturnValue(of([]));
    const fixture = await render();

    expect(text(fixture)).toContain('No passkeys yet');
  });

  it('adds a passkey, then asks what to call it', async () => {
    dialogResult = 'Pixel';
    const fixture = await render();

    addButton(fixture).click();
    expect(repo.register).toHaveBeenCalled();
    registered$.next({ ...YUBIKEY, id: 'pk-3', name: 'Passkey' });
    fixture.detectChanges();

    expect(open).toHaveBeenCalledWith(PasskeyNameDialog, {
      data: expect.objectContaining({ heading: 'Passkey added', name: 'Passkey' }),
    });
    expect(repo.rename).toHaveBeenCalledWith('pk-3', 'Pixel');
  });

  it('keeps the default name when naming is skipped', async () => {
    dialogResult = undefined;
    const fixture = await render();

    addButton(fixture).click();
    registered$.next({ ...YUBIKEY, id: 'pk-3', name: 'Passkey' });
    fixture.detectChanges();

    expect(repo.rename).not.toHaveBeenCalled();
    expect(fixture.componentInstance['facade'].passkeys().map((p) => p.name)).toEqual([
      'MacBook',
      'YubiKey',
      'Passkey',
    ]);
  });

  it('does nothing when the browser prompt is dismissed', async () => {
    repo.register.mockReturnValue(throwError(() => new PasskeyCancelledError()));
    const fixture = await render();

    addButton(fixture).click();

    expect(notifications.error).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    expect(fixture.componentInstance['facade'].isAdding()).toBe(false);
  });

  it('reports a passkey that could not be added', async () => {
    repo.register.mockReturnValue(
      throwError(() => new Error('This device already has a passkey for your account.')),
    );
    const fixture = await render();

    addButton(fixture).click();

    expect(notifications.error).toHaveBeenCalledWith(
      'This device already has a passkey for your account.',
    );
  });

  it('removes a passkey once confirmed', async () => {
    dialogResult = true;
    const fixture = await render();

    fixture.componentInstance['remove'](MACBOOK);
    fixture.detectChanges();

    expect(open).toHaveBeenCalledWith(RemovePasskeyDialog, { data: { name: 'MacBook' } });
    expect(repo.remove).toHaveBeenCalledWith('pk-1');
    expect(notifications.success).toHaveBeenCalledWith('“MacBook” no longer signs you in.');
    expect(text(fixture)).not.toContain('MacBook');
  });

  it('keeps it when removal is not confirmed', async () => {
    dialogResult = undefined;
    const fixture = await render();

    fixture.componentInstance['remove'](MACBOOK);

    expect(repo.remove).not.toHaveBeenCalled();
  });

  it('cannot add a passkey in a browser without them', async () => {
    supported = false;
    const fixture = await render();

    expect(addButton(fixture).disabled).toBe(true);
    expect(text(fixture)).toContain('This browser can’t make passkeys.');
  });
});
