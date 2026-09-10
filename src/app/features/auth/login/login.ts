import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Subscription } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth-store';
import { PasskeyCancelledError, WebAuthn } from '../../../core/auth/webauthn';
import { BrandMark } from '../../../shared/components/brand-mark/brand-mark';

/** Which way in failed — it decides the alert's headline. */
type SignInMethod = 'password' | 'passkey';

/**
 * Design 1l — one centred card, three fields — plus the passkey way in beside
 * it: a button that opens the browser's passkey prompt, and the same passkeys
 * offered among the email field's autofill suggestions.
 */
@Component({
  selector: 'md-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    BrandMark,
  ],
  templateUrl: './login.html',
  styleUrl: '../auth.css',
})
export class Login {
  private readonly auth = inject(AuthStore);
  private readonly webAuthn = inject(WebAuthn);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(3)]],
  });

  protected readonly hidePassword = signal(true);
  protected readonly submitting = signal(false);
  protected readonly failure = signal<{ method: SignInMethod; message: string } | null>(null);

  /**
   * Starts false and is only ever set in the browser, after hydration: this
   * page is server-rendered, where there are no passkeys, and a button that
   * appeared only on the client would not match the markup being hydrated.
   */
  protected readonly passkeysSupported = signal(false);

  private autofill: Subscription | null = null;
  private destroyed = false;

  constructor() {
    this.destroyRef.onDestroy(() => (this.destroyed = true));
    afterNextRender(() => {
      this.passkeysSupported.set(this.webAuthn.isSupported());
      void this.offerAutofill();
    });
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.failure.set(null);
    const { email, password } = this.form.getRawValue();
    this.auth
      .signIn(email, password)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (outcome) =>
          void this.router.navigateByUrl(outcome.kind === 'signed-in' ? '/' : '/login/verify'),
        error: (err: unknown) => {
          this.submitting.set(false);
          this.fail('password', err);
        },
      });
  }

  protected signInWithPasskey(): void {
    this.submitting.set(true);
    this.failure.set(null);
    this.auth
      .signInWithPasskey()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => void this.router.navigateByUrl('/'),
        error: (err: unknown) => {
          this.submitting.set(false);
          if (!(err instanceof PasskeyCancelledError)) this.fail('passkey', err);
          // Opening the prompt withdrew the autofill offer; make it again.
          void this.offerAutofill();
        },
      });
  }

  /**
   * Offers passkeys among the email field's autofill suggestions. It ends
   * quietly when it cannot be made; it errors only when a passkey was picked
   * and then refused, which is worth saying.
   *
   * A refused pick is not offered again until the button is used. Re-offering
   * at once would retry by itself wherever autofill is answered without a
   * person picking — Chrome's virtual authenticator does exactly that — and
   * sign-in would spin against the backend, one challenge per turn.
   */
  private async offerAutofill(): Promise<void> {
    if (!(await this.webAuthn.supportsAutofill()) || this.destroyed) return;
    this.autofill?.unsubscribe();
    this.autofill = this.auth
      .signInWithPasskey({ autofill: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => void this.router.navigateByUrl('/'),
        error: (err: unknown) => this.fail('passkey', err),
      });
  }

  private fail(method: SignInMethod, err: unknown): void {
    this.failure.set({
      method,
      message: err instanceof Error ? err.message : 'Something went wrong. Try again.',
    });
  }
}
