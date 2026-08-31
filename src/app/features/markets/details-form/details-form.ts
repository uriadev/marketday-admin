import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MediaRepository } from '../../../core/api/ports/media-repository';
import {
  MARKET_TYPE_LABELS,
  MarketDetailsPatch,
  MarketType,
} from '../../../core/models/market.model';
import { Notifications } from '../../../core/notifications/notifications';
import { ImageUpload } from '../../../shared/components/image-upload/image-upload';

/** The two pictures a market carries: list thumbnail and page hero. */
type MarketImage = 'imageUrl' | 'bannerUrl';

export type DetailsFormGroup = FormGroup<{
  name: FormControl<string>;
  slug: FormControl<string>;
  marketType: FormControl<MarketType | null>;
  description: FormControl<string>;
  imageUrl: FormControl<string | null>;
  bannerUrl: FormControl<string | null>;
  stallCount: FormControl<number | null>;
  stallFeePerDay: FormControl<number | null>;
  reviewApplications: FormControl<boolean>;
  acceptsPreOrders: FormControl<boolean>;
}>;
export type DetailsFormValue = ReturnType<DetailsFormGroup['getRawValue']>;

/**
 * The group both the wizard's Details step and the settings tab bind to.
 * Called from a field initialiser (the default `fb` argument), so `inject()`
 * resolves against the calling component.
 */
export function createDetailsForm(fb: FormBuilder = inject(FormBuilder)): DetailsFormGroup {
  return fb.nonNullable.group({
    name: fb.nonNullable.control('', Validators.required),
    slug: fb.nonNullable.control('', Validators.required),
    marketType: fb.nonNullable.control<MarketType | null>(null, Validators.required),
    description: fb.nonNullable.control('', Validators.maxLength(300)),
    imageUrl: fb.nonNullable.control<string | null>(null),
    bannerUrl: fb.nonNullable.control<string | null>(null),
    stallCount: fb.nonNullable.control<number | null>(null, [
      Validators.required,
      Validators.min(1),
    ]),
    stallFeePerDay: fb.nonNullable.control<number | null>(null, [
      Validators.required,
      Validators.min(0),
    ]),
    reviewApplications: fb.nonNullable.control(true),
    acceptsPreOrders: fb.nonNullable.control(true),
  });
}

/** The fields a caller persists — the group's raw value, named for the repository call. */
export function detailsFields(value: DetailsFormValue): MarketDetailsPatch {
  return { ...value };
}

/**
 * The inverse of {@link detailsFields}: seeds the group from a stored record.
 * Left pristine — a loaded market is the form's baseline, not an edit of it.
 */
export function seedDetailsForm(form: DetailsFormGroup, stored: MarketDetailsPatch): void {
  form.reset({ ...stored });
}

/**
 * The wizard's Details step and the settings tab's own details editor,
 * extracted so both bind the same `FormGroup` and the same image-upload
 * plumbing. It owns the upload round trip through `MediaRepository`, the way
 * `MarketScheduleForm` owns composing the RRULE — whoever hosts it decides
 * what happens on save.
 */
@Component({
  selector: 'md-market-details-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatDividerModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    ImageUpload,
  ],
  templateUrl: './details-form.html',
  styleUrl: './details-form.css',
})
export class MarketDetailsForm {
  private readonly media = inject(MediaRepository);
  private readonly notifications = inject(Notifications);

  readonly form = input.required<DetailsFormGroup>();

  /**
   * Whether the public URL is fixed. It is on the Settings tab: the slug is the
   * address the market already lives at, so renaming one must not quietly move
   * it and break every link that exists. The wizard leaves this off, because
   * there the slug is still being chosen.
   */
  readonly lockSlug = input(false);

  /**
   * Whether the pitch count is fixed. It is on the Settings tab: the Stalls tab
   * owns the layout, and the count is how many pitches are on it — a second
   * number that could disagree would just be a bug waiting to be filed.
   */
  readonly lockStallCount = input(false);

  protected readonly marketTypes = Object.entries(MARKET_TYPE_LABELS) as [MarketType, string][];
  /** Which of the two images is mid-upload, so only that zone shows a bar. */
  protected readonly uploading = signal<MarketImage | null>(null);

  constructor() {
    // Set up once the input is bound, and re-run if a host ever toggles it.
    effect(() => {
      const { slug, stallCount } = this.form().controls;
      const options = { emitEvent: false };
      this.lockSlug() ? slug.disable(options) : slug.enable(options);
      this.lockStallCount() ? stallCount.disable(options) : stallCount.enable(options);
    });
  }

  /** Slugify as the organiser types, until they edit the slug themselves. */
  protected syncSlug(): void {
    const { name, slug } = this.form().controls;
    // A locked slug is pristine but not up for grabs: without this, renaming a
    // market on the Settings tab would rewrite its public address.
    if (this.lockSlug() || slug.dirty) return;
    slug.setValue(
      name.value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, ''),
      { emitEvent: false },
    );
  }

  /**
   * Upload goes through `MediaRepository`, so a caller never touches a
   * `FileReader` or an endpoint — it only stores the URL it gets back.
   */
  protected onImagePicked(image: MarketImage, file: File): void {
    this.uploading.set(image);
    this.media.upload(file).subscribe({
      next: (uploaded) => {
        this.uploading.set(null);
        const control = this.form().controls[image];
        control.setValue(uploaded.url);
        control.markAsDirty();
      },
      error: () => {
        this.uploading.set(null);
        this.notifications.error("That image didn't upload. Try again.");
      },
    });
  }

  protected onImageCleared(image: MarketImage): void {
    const control = this.form().controls[image];
    control.setValue(null);
    control.markAsDirty();
  }

  protected onImageRejected(reason: string): void {
    this.notifications.error(reason);
  }
}
