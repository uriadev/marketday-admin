import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatChipInputEvent, MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { COMMA, ENTER } from '@angular/cdk/keycodes';
import { MediaRepository } from '../../../core/api/ports/media-repository';
import {
  VENDOR_DESCRIPTION_LIMIT,
  VENDOR_PHOTO_LIMIT,
  VENDOR_TRADES,
  VendorProfilePatch,
} from '../../../core/models/vendor.model';
import { Notifications } from '../../../core/notifications/notifications';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { ImageUpload } from '../../../shared/components/image-upload/image-upload';
import { VendorDetailFacade } from '../vendor-detail-facade';
import { VendorProfileFacade } from '../vendor-profile-facade';

type ProfileForm = FormGroup<{
  tradingName: FormControl<string>;
  registeredName: FormControl<string>;
  category: FormControl<string>;
  vatNumber: FormControl<string>;
  description: FormControl<string>;
  produceTags: FormControl<string[]>;
  contactName: FormControl<string>;
  phone: FormControl<string>;
  email: FormControl<string>;
  website: FormControl<string>;
  address: FormControl<string>;
  photos: FormControl<string[]>;
}>;

/**
 * The Profile tab of a vendor (design 2a): the record every market they join
 * reads from.
 *
 * One profile per vendor, not one per membership — the description, tags and
 * photos are the business's own, so a save publishes to every market page at
 * once. That is why the rail says so in as many words rather than leaving an
 * admin to guess how far an edit reaches.
 */
@Component({
  selector: 'md-vendor-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ReactiveFormsModule,
    Avatar,
    ImageUpload,
    MatButtonModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTooltipModule,
  ],
  templateUrl: './vendor-profile.html',
  styleUrl: './vendor-profile.css',
})
export class VendorProfile {
  /** Bound from the parent `:slug` route param by `withComponentInputBinding()`. */
  readonly slug = input.required<string>();

  protected readonly facade = inject(VendorProfileFacade);
  protected readonly vendorFacade = inject(VendorDetailFacade);
  private readonly fb = inject(FormBuilder);
  private readonly media = inject(MediaRepository);
  private readonly notifications = inject(Notifications);

  protected readonly descriptionLimit = VENDOR_DESCRIPTION_LIMIT;
  protected readonly photoLimit = VENDOR_PHOTO_LIMIT;
  /** Enter or a comma finishes a produce tag. */
  protected readonly tagSeparators = [ENTER, COMMA];

  protected readonly form: ProfileForm = this.fb.nonNullable.group({
    tradingName: this.fb.nonNullable.control('', Validators.required),
    registeredName: this.fb.nonNullable.control(''),
    category: this.fb.nonNullable.control('', Validators.required),
    vatNumber: this.fb.nonNullable.control(''),
    description: this.fb.nonNullable.control('', Validators.maxLength(VENDOR_DESCRIPTION_LIMIT)),
    produceTags: this.fb.nonNullable.control<string[]>([]),
    contactName: this.fb.nonNullable.control('', Validators.required),
    phone: this.fb.nonNullable.control(''),
    email: this.fb.nonNullable.control('', Validators.email),
    website: this.fb.nonNullable.control(''),
    address: this.fb.nonNullable.control(''),
    photos: this.fb.nonNullable.control<string[]>([]),
  });

  /** Which photo slot is mid-upload, so only that zone shows a bar. */
  protected readonly uploading = signal<number | null>(null);

  /**
   * Reactive forms are not signals, so anything the template derives from the
   * form reads this rather than the controls — a `computed()` over a
   * `FormControl` has no signal to depend on and never recomputes.
   */
  private readonly value = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  constructor() {
    effect(() => this.facade.load(this.slug()));
    // A fresh load is the form's new baseline, so it starts pristine.
    effect(() => {
      const profile = this.facade.profile();
      if (profile) this.reset();
    });
  }

  /* ── The record's own copy ─────────────────────────────────────────────── */

  /**
   * The categories the select offers. A vendor whose recorded trade predates
   * the list keeps it — dropping it silently would rewrite their record the
   * first time anyone saved an unrelated field.
   */
  protected readonly categories = computed(() => {
    const current = this.facade.profile()?.category ?? '';
    return current && !VENDOR_TRADES.includes(current)
      ? [current, ...VENDOR_TRADES]
      : [...VENDOR_TRADES];
  });

  /** Market names an edit publishes to — the amber card in the rail. */
  protected readonly reachedMarkets = computed(() =>
    (this.vendorFacade.vendor()?.memberships ?? []).map((membership) => membership.market),
  );

  protected readonly reachHeadline = computed(() => {
    const count = this.reachedMarkets().length;
    if (count === 0) return 'Edits reach no market pages yet';
    return `Edits reach ${count} market ${count === 1 ? 'page' : 'pages'}`;
  });

  protected readonly reachBody = computed(() => {
    const names = this.reachedMarkets();
    if (names.length === 0) {
      return 'The description, tags and photos are the vendor’s own. They publish the moment this vendor joins their first market.';
    }
    const listed =
      names.length === 1
        ? names[0]
        : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
    return `The description, tags and photos are the vendor’s own, not a market’s. Saving publishes to ${listed} at once.`;
  });

  /** Whoever holds the account — the person a transfer would move it from. */
  protected readonly accountHolder = computed(() => {
    const staff = this.vendorFacade.vendor()?.staff ?? [];
    return staff.find((person) => person.allMarkets && person.managesStaff) ?? staff[0] ?? null;
  });

  protected readonly staffLink = computed(() => {
    const count = this.vendorFacade.vendor()?.staffCount ?? 0;
    return `Manage the ${count} staff ${count === 1 ? 'account' : 'accounts'}`;
  });

  protected readonly descriptionLength = computed(() => (this.value().description ?? '').length);

  /* ── Produce tags ──────────────────────────────────────────────────────── */

  protected addTag(event: MatChipInputEvent): void {
    const label = event.value.trim();
    event.chipInput.clear();
    if (label === '') return;

    const tags = this.form.controls.produceTags.value;
    if (tags.some((tag) => tag.toLowerCase() === label.toLowerCase())) return;
    this.setTags([...tags, label]);
  }

  protected removeTag(label: string): void {
    this.setTags(this.form.controls.produceTags.value.filter((tag) => tag !== label));
  }

  private setTags(tags: string[]): void {
    this.form.controls.produceTags.setValue(tags);
    this.form.controls.produceTags.markAsDirty();
  }

  /* ── Photos ────────────────────────────────────────────────────────────── */

  /** Every stored photo, plus the empty slot that adds the next one. */
  protected readonly produceTags = computed(() => this.value().produceTags ?? []);

  protected readonly photos = computed(() => this.value().photos ?? []);

  protected readonly canAddPhoto = computed(() => this.photos().length < VENDOR_PHOTO_LIMIT);

  protected photoLabel(index: number): string {
    return index === 0 ? 'Cover' : `Photo ${index + 1}`;
  }

  /** Uploads through `MediaRepository`, so the form only ever stores a URL. */
  protected onPhotoPicked(index: number, file: File): void {
    this.uploading.set(index);
    this.media.upload(file, 'vendor-image').subscribe({
      next: ({ url }) => {
        const photos = [...this.photos()];
        photos[index] = url;
        this.setPhotos(photos);
        this.uploading.set(null);
      },
      error: (cause: unknown) => {
        this.uploading.set(null);
        this.notifications.error(
          cause instanceof Error ? cause.message : 'That photo could not be uploaded.',
        );
      },
    });
  }

  protected onPhotoCleared(index: number): void {
    this.setPhotos(this.photos().filter((_, i) => i !== index));
  }

  protected onPhotoRejected(reason: string): void {
    this.notifications.error(reason);
  }

  private setPhotos(photos: string[]): void {
    this.form.controls.photos.setValue(photos);
    this.form.controls.photos.markAsDirty();
  }

  /* ── Save ──────────────────────────────────────────────────────────────── */

  protected readonly canSave = computed(() => !this.facade.isSaving());

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notifications.error('Some fields still need attention.');
      return;
    }
    if (this.form.pristine) return;

    const patch: VendorProfilePatch = this.form.getRawValue();
    this.facade.save(patch, (profile) => {
      this.form.markAsPristine();
      this.notifications.success(
        this.reachedMarkets().length > 0
          ? `${profile.tradingName} is published to ${this.reachedMarkets().length} market ${
              this.reachedMarkets().length === 1 ? 'page' : 'pages'
            }.`
          : `${profile.tradingName} is saved.`,
      );
    });
  }

  /** Drops every unsaved edit back to the loaded record. */
  protected reset(): void {
    const profile = this.facade.profile();
    if (!profile) return;
    this.form.reset({
      tradingName: profile.tradingName,
      registeredName: profile.registeredName,
      category: profile.category,
      vatNumber: profile.vatNumber,
      description: profile.description,
      produceTags: [...profile.produceTags],
      contactName: profile.contactName,
      phone: profile.phone,
      email: profile.email,
      website: profile.website,
      address: profile.address,
      photos: [...profile.photos],
    });
  }
}
