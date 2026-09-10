import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { Observable } from 'rxjs';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser';

type SimpleWebAuthn = typeof import('@simplewebauthn/browser');

/**
 * The person closed the passkey prompt, let it time out, or another ceremony
 * took over (the sign-in button superseding the autofill offer). None of those
 * are failures worth an error message, so callers check for this and stay quiet.
 */
export class PasskeyCancelledError extends Error {
  constructor() {
    super('The passkey prompt was dismissed.');
    this.name = 'PasskeyCancelledError';
  }
}

/**
 * The one seam over the browser's WebAuthn API — nothing else in the app
 * touches `navigator.credentials`, and tests stub this class instead.
 *
 * Each ceremony is an Observable that emits once, and unsubscribing withdraws
 * a prompt still waiting on the person — which is how an autofill offer is
 * taken back when the login page goes away or the offer is renewed.
 *
 * `@simplewebauthn/browser` is loaded on first use through a dynamic import. It
 * stays out of the initial bundle, and out of the server render entirely: the
 * login page is server-rendered (`app.routes.server.ts`), and there is no
 * `navigator.credentials` to call there.
 */
@Injectable({ providedIn: 'root' })
export class WebAuthn {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /**
   * Whether this browser can use passkeys at all. Always false on the server;
   * false on plain `http://` other than localhost, where browsers withhold the
   * API.
   */
  isSupported(): boolean {
    return (
      this.isBrowser && window.isSecureContext && typeof window.PublicKeyCredential === 'function'
    );
  }

  /** Whether the browser can offer passkeys among an input's autofill suggestions. */
  async supportsAutofill(): Promise<boolean> {
    if (!this.isSupported()) return false;
    const { browserSupportsWebAuthnAutofill } = await import('@simplewebauthn/browser');
    return browserSupportsWebAuthnAutofill();
  }

  /** The registration prompt: makes a new passkey on an authenticator. */
  create(options: PublicKeyCredentialCreationOptionsJSON): Observable<RegistrationResponseJSON> {
    return ceremony((lib) => lib.startRegistration({ optionsJSON: options }));
  }

  /**
   * The sign-in prompt. With `autofill` there is no prompt: the browser lists
   * passkeys among the suggestions of the page's `autocomplete="… webauthn"`
   * input, and this emits only once one is picked. Starting any other ceremony
   * withdraws a pending one, which then errors with {@link PasskeyCancelledError}.
   */
  get(
    options: PublicKeyCredentialRequestOptionsJSON,
    { autofill = false }: { autofill?: boolean } = {},
  ): Observable<AuthenticationResponseJSON> {
    return ceremony((lib) =>
      lib.startAuthentication({ optionsJSON: options, useBrowserAutofill: autofill }),
    );
  }
}

function ceremony<T>(start: (lib: SimpleWebAuthn) => Promise<T>): Observable<T> {
  return new Observable<T>((subscriber) => {
    let withdraw: (() => void) | null = null;
    import('@simplewebauthn/browser').then(
      (lib) => {
        // Unsubscribed while the library was still loading: never prompt.
        if (subscriber.closed) return;
        withdraw = () => lib.WebAuthnAbortService.cancelCeremony();
        start(lib).then(
          (value) => {
            withdraw = null;
            subscriber.next(value);
            subscriber.complete();
          },
          (err: unknown) => {
            withdraw = null;
            subscriber.error(classify(err));
          },
        );
      },
      (err: unknown) => subscriber.error(err),
    );
    return () => withdraw?.();
  });
}

/**
 * Checked by `name` rather than `instanceof WebAuthnError`, which would need a
 * static import of the library. SimpleWebAuthn names its errors after the
 * browser's own `DOMException`, so the same check covers both.
 */
function classify(err: unknown): Error {
  const name = err instanceof Error ? err.name : '';
  // NotAllowedError is "dismissed" and "timed out" alike — and, on purpose, a
  // few failures browsers refuse to tell apart from those so a page cannot
  // probe which passkeys exist. Nothing useful can be said about any of them.
  // AbortError is a superseded ceremony.
  if (name === 'NotAllowedError' || name === 'AbortError') {
    return new PasskeyCancelledError();
  }
  // Registration only: the authenticator already holds one of this account's
  // passkeys (the backend lists them in `excludeCredentials`).
  if (name === 'InvalidStateError') {
    return new Error('This device already has a passkey for your account.');
  }
  return err instanceof Error ? err : new Error('Your passkey could not be used. Try again.');
}
