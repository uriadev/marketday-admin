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
import { map } from 'rxjs/operators';
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
  imageUrl: FormControl<string | null>;
}>;

/**
 * The Profile tab of a vendor (design 2a): the record every market they join
 * reads from.
 *
 * One profile per vendor, not one per membership — the description, tags and
 * photo are the business's own, so a save publishes to every market page at
 * once. That is why the rail says so in as many words rather than leaving an
 * admin to guess how far an edit reaches.
 *
 * Most of the record is read-only here. `UpdateVendorInput` covers the trading
 * name, category, description and photo; the registered name, VAT, produce
 * tags, contact block and address have no column server-side
 * (`docs/backend-api-gaps.md` #7), so they are disabled and say so. Whatever
 * the record already holds still shows in them — the fixture path fills them
 * all — it just cannot be edited from the console. {@link save} still sends
 * `getRawValue()`, so a disabled field rides along untouched and the port
 * decides its fate: the fixture keeps the whole patch, while
 * `GraphqlVendorRepository` sends the four fields `updateVendor` has a column
 * for and drops the rest rather than posting them nowhere.
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
  /** Enter or a comma finishes a produce tag. */
  protected readonly tagSeparators = [ENTER, COMMA];

  /**
   * Four of these are editable and eight are not. `UpdateVendorInput` carries
   * `name`, `category`, `description` and `imageUrl` and nothing else
   * (`docs/backend-api-gaps.md` #7), so the registered name, VAT, produce tags,
   * the whole contact block and the address are disabled: they have no column
   * to land in, and a field that looks editable but drops what is typed is
   * worse than one that is plainly greyed out.
   *
   * Their validators stay attached. A disabled control is skipped by the
   * group's validity, so `contactName`'s `required` costs nothing today, and
   * enabling the control when the column lands is then the whole change.
   */
  protected readonly form: ProfileForm = this.fb.nonNullable.group({
    tradingName: this.fb.nonNullable.control('', Validators.required),
    registeredName: this.fb.nonNullable.control({ value: '', disabled: true }),
    category: this.fb.nonNullable.control('', Validators.required),
    vatNumber: this.fb.nonNullable.control({ value: '', disabled: true }),
    description: this.fb.nonNullable.control('', Validators.maxLength(VENDOR_DESCRIPTION_LIMIT)),
    produceTags: this.fb.nonNullable.control<string[]>({ value: [], disabled: true }),
    contactName: this.fb.nonNullable.control({ value: '', disabled: true }, Validators.required),
    phone: this.fb.nonNullable.control({ value: '', disabled: true }),
    email: this.fb.nonNullable.control({ value: '', disabled: true }, Validators.email),
    website: this.fb.nonNullable.control({ value: '', disabled: true }),
    address: this.fb.nonNullable.control({ value: '', disabled: true }),
    imageUrl: this.fb.control<string | null>(null),
  });

  /** True while the one photo is uploading, so its zone shows a bar. */
  protected readonly uploading = signal(false);

  /**
   * Reactive forms are not signals, so anything the template derives from the
   * form reads this rather than the controls — a `computed()` over a
   * `FormControl` has no signal to depend on and never recomputes. Re-read raw
   * rather than taking `valueChanges`' own payload, which omits every disabled
   * control — that is most of this form, and the tags and photo the template
   * renders are two of them.
   */
  private readonly value = toSignal(
    this.form.valueChanges.pipe(map(() => this.form.getRawValue())),
    { initialValue: this.form.getRawValue() },
  );

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
      return 'The description, tags and photo are the vendor’s own. They publish the moment this vendor joins their first market.';
    }
    const listed =
      names.length === 1
        ? names[0]
        : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
    return `The description, tags and photo are the vendor’s own, not a market’s. Saving publishes to ${listed} at once.`;
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

  protected readonly produceTags = computed(() => this.value().produceTags ?? []);

  /* ── Photo ─────────────────────────────────────────────────────────────── */

  /**
   * One slot, not a gallery: `Vendor.imageUrl` is a single column, so a second
   * zone would take a photo the save then silently dropped.
   */
  protected readonly imageUrl = computed(() => this.value().imageUrl ?? null);

  /** Uploads through `MediaRepository`, so the form only ever stores a URL. */
  protected onPhotoPicked(file: File): void {
    this.uploading.set(true);
    // Required, not incidental: the presign is keyed by the vendor and an admin
    // holds no seat the backend could infer one from.
    this.media.upload(file, 'vendor-image', this.facade.vendorId() ?? undefined).subscribe({
      next: ({ url }) => {
        this.setImage(url);
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

  protected onPhotoCleared(): void {
    this.setImage(null);
  }

  protected onPhotoRejected(reason: string): void {
    this.notifications.error(reason);
  }

  private setImage(url: string | null): void {
    this.form.controls.imageUrl.setValue(url);
    this.form.controls.imageUrl.markAsDirty();
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
      imageUrl: profile.imageUrl,
    });
  }
}
