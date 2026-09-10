import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { NEVER, Subject, throwError } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth-store';
import { PasskeyCancelledError, WebAuthn } from '../../../core/auth/webauthn';
import { SignInOutcome } from '../../../core/api/ports/auth-repository';
import { AdminUser } from '../../../core/models/admin-user.model';
import { Login } from './login';

const ADMIN: AdminUser = {
  id: 'usr-1',
  name: 'Áine Ryan',
  email: 'aine@marketday.ie',
  role: 'Admin',
};

describe('Login', () => {
  let signIn: ReturnType<typeof vi.fn>;
  let outcome$: Subject<SignInOutcome>;
  let signInWithPasskey: ReturnType<typeof vi.fn>;
  let passkey$: Subject<AdminUser>;
  let webAuthn: {
    isSupported: ReturnType<typeof vi.fn>;
    supportsAutofill: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    outcome$ = new Subject<SignInOutcome>();
    signIn = vi.fn(() => outcome$.asObservable());
    passkey$ = new Subject<AdminUser>();
    // The button's ceremony answers through `passkey$`; the autofill offer
    // never settles, as when nobody picks a passkey from the email field.
    signInWithPasskey = vi.fn((options?: { autofill?: boolean }) =>
      options?.autofill ? NEVER : passkey$.asObservable(),
    );
    webAuthn = {
      isSupported: vi.fn(() => true),
      supportsAutofill: vi.fn(() => Promise.resolve(false)),
    };

    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        { provide: AuthStore, useValue: { signIn, signInWithPasskey } },
        { provide: WebAuthn, useValue: webAuthn },
      ],
    }).compileComponents();
  });

  /** Renders, and lets `afterNextRender` decide what the browser supports. */
  async function render() {
    const fixture = TestBed.createComponent(Login);
    await fixture.whenStable();
    return fixture;
  }

  const passkeyButton = (fixture: Awaited<ReturnType<typeof render>>) =>
    [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Sign in with a passkey'),
    );

  it('does not call the store while the form is invalid', () => {
    const fixture = TestBed.createComponent(Login);
    fixture.componentInstance['submit']();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('requests a code with the entered credentials', () => {
    const fixture = TestBed.createComponent(Login);
    const component = fixture.componentInstance;
    component['form'].setValue({ email: 'aine@marketday.ie', password: 'password123' });

    component['submit']();

    expect(signIn).toHaveBeenCalledWith('aine@marketday.ie', 'password123');
    expect(component['submitting']()).toBe(true);
  });

  it('surfaces a server error message', () => {
    const fixture = TestBed.createComponent(Login);
    const component = fixture.componentInstance;
    component['form'].setValue({ email: 'aine@marketday.ie', password: 'password123' });

    component['submit']();
    outcome$.error(new Error('That email and password don’t match an account.'));

    expect(component['submitting']()).toBe(false);
    expect(component['failure']()).toEqual({
      method: 'password',
      message: 'That email and password don’t match an account.',
    });
  });

  describe('passkeys', () => {
    it('offers the passkey button once the browser says it can', async () => {
      const fixture = await render();
      expect(passkeyButton(fixture)).toBeDefined();
    });

    it('hides the passkey button where passkeys are unsupported', async () => {
      webAuthn.isSupported.mockReturnValue(false);
      const fixture = await render();
      expect(passkeyButton(fixture)).toBeUndefined();
    });

    it('signs in with a passkey and goes to the console', async () => {
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      const fixture = await render();

      passkeyButton(fixture)!.click();
      expect(signInWithPasskey).toHaveBeenCalledWith();
      expect(fixture.componentInstance['submitting']()).toBe(true);

      passkey$.next(ADMIN);
      expect(navigate).toHaveBeenCalledWith('/');
    });

    it('says nothing when the prompt is dismissed', async () => {
      const fixture = await render();

      passkeyButton(fixture)!.click();
      passkey$.error(new PasskeyCancelledError());

      expect(fixture.componentInstance['submitting']()).toBe(false);
      expect(fixture.componentInstance['failure']()).toBeNull();
    });

    it('explains a refused passkey', async () => {
      const fixture = await render();

      passkeyButton(fixture)!.click();
      passkey$.error(new Error('Invalid passkey'));
      fixture.detectChanges();

      expect(fixture.componentInstance['failure']()).toEqual({
        method: 'passkey',
        message: 'Invalid passkey',
      });
      expect((fixture.nativeElement as HTMLElement).textContent).toContain(
        'That passkey didn’t work',
      );
    });

    it('offers passkeys in the email field’s autofill where the browser can', async () => {
      webAuthn.supportsAutofill.mockResolvedValue(true);
      await render();
      expect(signInWithPasskey).toHaveBeenCalledWith({ autofill: true });
    });

    it('explains a passkey picked from autofill and refused, without offering it again', async () => {
      webAuthn.supportsAutofill.mockResolvedValue(true);
      signInWithPasskey.mockImplementation((options?: { autofill?: boolean }) =>
        options?.autofill
          ? throwError(() => new Error('Invalid passkey'))
          : passkey$.asObservable(),
      );
      const fixture = await render();

      expect(fixture.componentInstance['failure']()).toEqual({
        method: 'passkey',
        message: 'Invalid passkey',
      });
      // Re-offering at once would spin wherever autofill answers by itself.
      expect(signInWithPasskey).toHaveBeenCalledTimes(1);
    });

    it('offers autofill again once a button attempt is over', async () => {
      webAuthn.supportsAutofill.mockResolvedValue(true);
      const fixture = await render();

      passkeyButton(fixture)!.click();
      passkey$.error(new PasskeyCancelledError());
      await fixture.whenStable();

      const offers = signInWithPasskey.mock.calls.filter(([o]) => o?.autofill);
      expect(offers.length).toBe(2);
    });

    it('makes no autofill offer where the browser cannot', async () => {
      await render();
      expect(signInWithPasskey).not.toHaveBeenCalled();
    });
  });
});
