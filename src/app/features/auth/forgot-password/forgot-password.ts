import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { BrandMark } from '../../../shared/components/brand-mark/brand-mark';

/** Reached from the "Forgot password?" link on 1l. Fixture-only for now. */
@Component({
  selector: 'md-forgot-password',
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
          <h1 class="auth-title">Reset your password</h1>
          <p class="auth-subtitle">We’ll email you a link to set a new one.</p>
        </div>
      </header>

      @if (sentTo(); as email) {
        <div
          class="auth-alert"
          role="status"
          style="background: var(--mat-sys-secondary-container); color: var(--mat-sys-on-secondary-container);"
        >
          <mat-icon aria-hidden="true">mark_email_read</mat-icon>
          <div>
            <p class="auth-alert-title">Check {{ email }}</p>
            <p class="auth-alert-body">
              If that address has an account, a reset link is on its way.
            </p>
          </div>
        </div>
      } @else {
        <form [formGroup]="form" (ngSubmit)="submit()" class="auth-form">
          <mat-form-field>
            <mat-label>Email</mat-label>
            <input
              matInput
              type="email"
              formControlName="email"
              autocomplete="username"
              autocapitalize="off"
              spellcheck="false"
            />
            @if (form.controls.email.touched && form.controls.email.invalid) {
              <mat-error>Enter the email you sign in with.</mat-error>
            }
          </mat-form-field>

          <button matButton="filled" type="submit" class="auth-submit">Send reset link</button>
        </form>
      }

      <a routerLink="/login" class="auth-link">← Back to sign in</a>
    </div>
  `,
})
export class ForgotPassword {
  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected readonly sentTo = signal<string | null>(null);

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.sentTo.set(this.form.getRawValue().email);
  }
}
