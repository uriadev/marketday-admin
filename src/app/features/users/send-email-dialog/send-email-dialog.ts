import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
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
import { catchError, debounceTime, filter, map, switchMap, tap } from 'rxjs/operators';
import { Account, AdminEmail, EmailPreview } from '../../../core/models/account.model';
import { RichTextEditor } from '../../../shared/components/rich-text-editor/rich-text-editor';

export interface SendEmailDialogData {
  account: Account;
  /** Renders the message as the backend would send it; nothing is sent. */
  preview: (email: AdminEmail) => Observable<EmailPreview>;
}

const DEFAULT_EYEBROW = 'From the MarketDay team';

/**
 * The width the email is drawn at before it is scaled into the pane: the
 * template's 600px card plus a margin of its grey page either side, which is
 * how an inbox shows it. Narrower, and the card's own padding squeezes the copy.
 */
const EMAIL_WIDTH = 664;

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
 * The form holds only the words — subject, eyebrow, heading, the message as
 * rich text and an optional button — and the preview beside it is the
 * backend's own rendering of them (`previewAdminEmail`), so what the admin
 * reads is what arrives.
 *
 * The preview is drawn like an inbox would: the subject and recipient above,
 * the email at its real width scaled down to the pane, and as tall as it is,
 * so the pane scrolls rather than a cramped frame inside it. The iframe is
 * sandboxed without scripts; `allow-same-origin` is only so its height can be
 * read.
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
    RichTextEditor,
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
      /** The editor reports `''` while it holds no words, so `notBlank` is enough. */
      bodyHtml: new FormControl('', {
        nonNullable: true,
        validators: [notBlank, Validators.maxLength(20000)],
      }),
      ctaLabel: new FormControl('', { nonNullable: true, validators: Validators.maxLength(40) }),
      ctaUrl: new FormControl('', {
        nonNullable: true,
        validators: Validators.pattern(/^\s*https:\/\/\S+\s*$/),
      }),
    },
    { validators: wholeButton },
  );

  protected readonly subject = toSignal(this.form.controls.subject.valueChanges, {
    initialValue: '',
  });

  /** The last rendering, kept on screen while the next one is drawn. */
  protected readonly rendered = signal<SafeHtml | null>(null);
  protected readonly loading = signal(false);
  protected readonly previewError = signal<string | null>(null);

  private readonly viewport = viewChild<ElementRef<HTMLElement>>('viewport');
  private readonly paneWidth = signal(EMAIL_WIDTH);
  protected readonly contentHeight = signal(0);
  protected readonly emailWidth = EMAIL_WIDTH;
  protected readonly scale = computed(() => Math.min(1, this.paneWidth() / EMAIL_WIDTH));

  constructor() {
    // Re-rendered a moment after the admin stops typing, and only for a form
    // the backend would accept — an invalid one would just come back refused.
    this.form.valueChanges
      .pipe(
        debounceTime(400),
        filter(() => this.form.valid),
        tap(() => this.loading.set(true)),
        switchMap((): Observable<SafeHtml | Error> =>
          this.data.preview(this.email()).pipe(
            // The backend's own template, shown in a sandbox that runs nothing.
            map((preview) => this.sanitizer.bypassSecurityTrustHtml(preview.html)),
            catchError((cause: unknown) =>
              of(cause instanceof Error ? cause : new Error('The preview could not be drawn.')),
            ),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((result) => {
        this.loading.set(false);
        if (result instanceof Error) {
          this.previewError.set(result.message);
          return;
        }
        this.previewError.set(null);
        this.rendered.set(result);
      });

    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const viewport = this.viewport()?.nativeElement;
      if (!viewport || typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(([entry]) => {
        if (entry) this.paneWidth.set(entry.contentRect.width);
      });
      observer.observe(viewport);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  /** Sizes the frame to the email, so the pane scrolls instead of the frame. */
  protected measure(frame: HTMLIFrameElement): void {
    const height = frame.contentDocument?.documentElement.scrollHeight ?? 0;
    if (height > 0) this.contentHeight.set(height);
  }

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
      bodyHtml: value.bodyHtml,
      cta: label && url ? { label, url } : null,
    };
  }
}
