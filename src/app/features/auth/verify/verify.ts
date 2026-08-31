import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AuthStore } from '../../../core/auth/auth-store';
import { BrandMark } from '../../../shared/components/brand-mark/brand-mark';

/** Design 1m — the verification-code state the sign-in form lands on. */
@Component({
  selector: 'md-verify',
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
  styleUrl: '../auth.css',
  template: `
    <div class="auth-stack">
      <header class="auth-brand">
        <md-brand-mark [size]="40" />
        <div>
          <h1 class="auth-title">Check your phone</h1>
          <p class="auth-subtitle">
            @if (challenge(); as pending) {
              We sent a six-digit code to the {{ pending.sentTo }}.
            } @else {
              Enter the six-digit code we sent you.
            }
          </p>
        </div>
      </header>

      @if (errorMessage(); as message) {
        <div class="auth-alert" role="alert">
          <mat-icon aria-hidden="true">error</mat-icon>
          <div>
            <p class="auth-alert-title">That code didn’t work</p>
            <p class="auth-alert-body">{{ message }}</p>
          </div>
        </div>
      }

      <form [formGroup]="form" (ngSubmit)="submit()" class="auth-form">
        <mat-form-field class="auth-code">
          <mat-label>Six-digit code</mat-label>
          <input
            matInput
            formControlName="code"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
          />
          @if (form.controls.code.touched && form.controls.code.invalid) {
            <mat-error>Enter the six digits from the message.</mat-error>
          }
        </mat-form-field>

        <button
          matButton="filled"
          type="submit"
          class="auth-submit"
          [disabled]="submitting() || form.controls.code.invalid"
        >
          {{ submitting() ? 'Verifying…' : 'Verify and continue' }}
        </button>

        <p class="auth-hint">
          Didn’t get it?
          @if (resendIn() > 0) {
            <span>Resend in {{ clock() }}</span>
          } @else {
            <button matButton type="button" (click)="resend()">Resend code</button>
          }
        </p>
      </form>

      <a routerLink="/login" class="auth-link">← Back to sign in</a>
    </div>
  `,
})
export class Verify {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly challenge = this.auth.challenge;

  protected readonly form = inject(NonNullableFormBuilder).group({
    code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
  });

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly resendIn = signal(24);
  protected readonly clock = computed(() => `0:${String(this.resendIn()).padStart(2, '0')}`);

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      const timer = setInterval(() => this.resendIn.update((n) => (n > 0 ? n - 1 : 0)), 1000);
      this.destroyRef.onDestroy(() => clearInterval(timer));
    }
  }

  protected resend(): void {
    this.resendIn.set(24);
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set(null);
    this.auth
      .verifyCode(this.form.getRawValue().code)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => void this.router.navigateByUrl('/'),
        error: (err: unknown) => {
          this.submitting.set(false);
          this.errorMessage.set(
            err instanceof Error ? err.message : 'Something went wrong. Try again.',
          );
        },
      });
  }
}
