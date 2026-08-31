import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MediaRepository } from '../../../core/api/ports/media-repository';
import {
  AdminProfilePatch,
  NOTIFICATION_KEYS,
  NOTIFICATION_LABELS,
  NotificationKey,
} from '../../../core/models/admin-user.model';
import { Notifications } from '../../../core/notifications/notifications';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { ProfileFacade } from '../profile-facade';

/** What the avatar upload accepts, as the design's hint says. */
const PHOTO_TYPES = ['image/jpeg', 'image/png'];
const PHOTO_MAX_MB = 5;

type ProfileForm = FormGroup<{
  firstName: FormControl<string>;
  lastName: FormControl<string>;
  phone: FormControl<string>;
  avatarUrl: FormControl<string | null>;
  twoFactor: FormControl<boolean>;
  payoutSummary: FormControl<boolean>;
  vendorApplications: FormControl<boolean>;
  marketDayReminders: FormControl<boolean>;
}>;

/**
 * The signed-in admin's own profile (design 1k): how they appear to vendors and
 * other organisers, plus the two security settings and the three notifications
 * that belong to them rather than to a market.
 *
 * Email and role are shown but not editable. Changing an email is a
 * verification flow of its own, and nobody sets their own role — a super admin
 * does that from the Users screen.
 */
@Component({
  selector: 'md-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    Avatar,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSlideToggleModule,
    MatTooltipModule,
  ],
  templateUrl: './profile.html',
  styleUrl: './profile.css',
})
export class Profile {
  protected readonly facade = inject(ProfileFacade);
  private readonly fb = inject(FormBuilder);
  private readonly media = inject(MediaRepository);
  private readonly notifications = inject(Notifications);

  protected readonly notificationKeys = NOTIFICATION_KEYS;
  protected readonly notificationLabels = NOTIFICATION_LABELS;
  protected readonly photoAccept = PHOTO_TYPES.join(',');

  private readonly picker = viewChild.required<ElementRef<HTMLInputElement>>('picker');

  protected readonly form: ProfileForm = this.fb.nonNullable.group({
    firstName: this.fb.nonNullable.control('', Validators.required),
    lastName: this.fb.nonNullable.control('', Validators.required),
    phone: this.fb.nonNullable.control(''),
    avatarUrl: this.fb.nonNullable.control<string | null>(null),
    twoFactor: this.fb.nonNullable.control(true),
    payoutSummary: this.fb.nonNullable.control(true),
    vendorApplications: this.fb.nonNullable.control(true),
    marketDayReminders: this.fb.nonNullable.control(false),
  });

  protected readonly uploading = signal(false);
  protected readonly sendingReset = signal(false);

  /**
   * Reactive forms are not signals, so anything the template derives from the
   * form reads this rather than the controls — a `computed()` over a
   * `FormControl` never recomputes.
   */
  private readonly value = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  constructor() {
    this.facade.load();
    // A fresh load is the form's new baseline, so it starts pristine.
    effect(() => {
      if (this.facade.profile()) this.reset();
    });
  }

  /** "Áine Ryan" — the face follows what is typed, before any save. */
  protected readonly fullName = computed(() => {
    const { firstName, lastName } = this.value();
    return `${firstName ?? ''} ${lastName ?? ''}`.trim() || 'Your account';
  });

  protected readonly avatarUrl = computed(() => this.value().avatarUrl ?? null);

  protected readonly twoFactorOn = computed(() => this.value().twoFactor ?? false);

  /* ── Photo ─────────────────────────────────────────────────────────────── */

  protected openPicker(): void {
    if (this.uploading()) return;
    this.picker().nativeElement.click();
  }

  /** Uploads through `MediaRepository`, so the form only ever stores a URL. */
  protected onPhotoPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Reset so picking the same file twice still fires `change`.
    input.value = '';
    if (!file) return;

    if (!PHOTO_TYPES.includes(file.type)) {
      this.notifications.error('Your photo must be a JPG or PNG image.');
      return;
    }
    if (file.size > PHOTO_MAX_MB * 1024 * 1024) {
      this.notifications.error(`Your photo must be under ${PHOTO_MAX_MB} MB.`);
      return;
    }

    this.uploading.set(true);
    this.media.upload(file).subscribe({
      next: ({ url }) => {
        this.setAvatar(url);
        this.uploading.set(false);
      },
      error: (cause: unknown) => {
        this.uploading.set(false);
        this.notifications.error(
          cause instanceof Error ? cause.message : 'That photo could not be uploaded.',
        );
      },
    });
  }

  protected removePhoto(): void {
    this.setAvatar(null);
  }

  private setAvatar(url: string | null): void {
    this.form.controls.avatarUrl.setValue(url);
    this.form.controls.avatarUrl.markAsDirty();
  }

  /* ── Security ──────────────────────────────────────────────────────────── */

  protected changePassword(): void {
    this.sendingReset.set(true);
    this.facade.sendPasswordReset(
      () => {
        this.sendingReset.set(false);
        const email = this.facade.profile()?.email ?? 'your inbox';
        this.notifications.success(`A reset link is on its way to ${email}.`);
      },
      (message) => {
        this.sendingReset.set(false);
        this.notifications.error(message);
      },
    );
  }

  /* ── Save ──────────────────────────────────────────────────────────────── */

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notifications.error('Some fields still need attention.');
      return;
    }
    if (this.form.pristine) return;

    const value = this.form.getRawValue();
    const patch: AdminProfilePatch = {
      firstName: value.firstName,
      lastName: value.lastName,
      phone: value.phone,
      avatarUrl: value.avatarUrl,
      twoFactor: value.twoFactor,
      notifications: {
        payoutSummary: value.payoutSummary,
        vendorApplications: value.vendorApplications,
        marketDayReminders: value.marketDayReminders,
      },
    };
    this.facade.save(patch, () => {
      this.form.markAsPristine();
      this.notifications.success('Your profile is saved.');
    });
  }

  /** Drops every unsaved edit back to the loaded account. */
  protected reset(): void {
    const profile = this.facade.profile();
    if (!profile) return;
    this.form.reset({
      firstName: profile.firstName,
      lastName: profile.lastName,
      phone: profile.phone,
      avatarUrl: profile.avatarUrl,
      twoFactor: profile.twoFactor,
      payoutSummary: profile.notifications.payoutSummary,
      vendorApplications: profile.notifications.vendorApplications,
      marketDayReminders: profile.notifications.marketDayReminders,
    });
  }

  /** The three notification toggles share one control name each. */
  protected notificationControl(key: NotificationKey): FormControl<boolean> {
    return this.form.controls[key];
  }
}
