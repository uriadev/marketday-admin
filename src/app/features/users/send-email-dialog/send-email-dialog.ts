import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Observable, of } from 'rxjs';
import { catchError, debounceTime, map, startWith, switchMap } from 'rxjs/operators';
import { Account, AdminEmail, EmailPreview } from '../../../core/models/account.model';

export interface SendEmailDialogData {
  account: Account;
  /** Renders the message as the backend would send it; nothing is sent. */
  preview: (email: AdminEmail) => Observable<EmailPreview>;
}

/** What the preview pane shows: nothing yet, a rendering, or why there is none. */
type PreviewState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; html: SafeHtml }
  | { kind: 'failed'; message: string };

const DEFAULT_EYEBROW = 'From the MarketDay team';

/** Only spaces is nothing at all. */
function notBlank(control: AbstractControl<string>): ValidationErrors | null {
  return control.value.trim() === '' ? { required: true } : null;
}

/** A button needs both its words and somewhere to go — the backend refuses half of one. */
function wholeButton(group: AbstractControl): ValidationErrors | null {
  const label = (group.get('ctaLabel')?.value as string).trim();
  const url = (group.get('ctaUrl')?.value as string).trim();
  return Boolean(label) === Boolean(url) ? null : { halfButton: true };
}

/**
 * Writes one account a message in the MarketDay email template.
 *
 * The form holds only the words — subject, eyebrow, heading, body and an
 * optional button — and the preview beside it is the backend's own rendering
 * of them (`previewAdminEmail`), so what the admin reads is what arrives. It
 * shows in a sandboxed iframe: the email carries its own inline styles, which
 * must not leak into the console, and nothing in it should run.
 */
@Component({
  selector: 'md-send-email-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
  ],
  templateUrl: './send-email-dialog.html',
})
export class SendEmailDialog {
  protected readonly data = inject<SendEmailDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<SendEmailDialog, AdminEmail>>(MatDialogRef);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly form = new FormGroup(
    {
      subject: new FormControl('', {
        nonNullable: true,
        validators: [notBlank, Validators.maxLength(150)],
      }),
      eyebrow: new FormControl(DEFAULT_EYEBROW, {
        nonNullable: true,
        validators: [notBlank, Validators.maxLength(40)],
      }),
      heading: new FormControl('', {
        nonNullable: true,
        validators: [notBlank, Validators.maxLength(120)],
      }),
      body: new FormControl('', {
        nonNullable: true,
        validators: [notBlank, Validators.maxLength(5000)],
      }),
      ctaLabel: new FormControl('', { nonNullable: true, validators: Validators.maxLength(40) }),
      ctaUrl: new FormControl('', {
        nonNullable: true,
        validators: Validators.pattern(/^\s*https:\/\/\S+\s*$/),
      }),
    },
    { validators: wholeButton },
  );

  /**
   * Re-rendered a moment after the admin stops typing, and only for a form the
   * backend would accept — an invalid one would just come back as an error.
   */
  protected readonly preview = toSignal(
    this.form.valueChanges.pipe(
      startWith(null),
      debounceTime(400),
      switchMap((): Observable<PreviewState> => {
        if (this.form.invalid) return of({ kind: 'idle' });
        return this.data.preview(this.email()).pipe(
          map((rendered): PreviewState => ({
            kind: 'ready',
            // The backend's own template, shown in a sandbox that runs nothing.
            html: this.sanitizer.bypassSecurityTrustHtml(rendered.html),
          })),
          catchError((cause: unknown) =>
            of<PreviewState>({
              kind: 'failed',
              message: cause instanceof Error ? cause.message : 'The preview could not be drawn.',
            }),
          ),
          startWith<PreviewState>({ kind: 'loading' }),
        );
      }),
    ),
    { initialValue: { kind: 'idle' } as PreviewState },
  );

  protected send(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.ref.close(this.email());
  }

  private email(): AdminEmail {
    const value = this.form.getRawValue();
    const label = value.ctaLabel.trim();
    const url = value.ctaUrl.trim();
    return {
      subject: value.subject.trim(),
      eyebrow: value.eyebrow.trim(),
      heading: value.heading.trim(),
      body: value.body.trim(),
      cta: label && url ? { label, url } : null,
    };
  }
}
