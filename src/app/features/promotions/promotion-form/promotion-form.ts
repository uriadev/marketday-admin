import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { map } from 'rxjs/operators';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTimepickerModule } from '@angular/material/timepicker';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MediaRepository } from '../../../core/api/ports/media-repository';
import { PickerOption } from '../../../core/models/picker-option.model';
import {
  DEFAULT_REACH_RADIUS_KM,
  MAX_BODY_LENGTH,
  MAX_CTA_LENGTH,
  MAX_HEADLINE_LENGTH,
  MAX_REACH_RADIUS_KM,
  PLACEMENT_RULES,
  PROMOTION_PLACEMENTS,
  PROMOTION_PLACEMENT_LABELS,
  PROMOTION_SERVING_STATE_HINTS,
  PROMOTION_SERVING_STATE_LABELS,
  PROMOTION_TARGET_KINDS,
  PROMOTION_TARGET_KIND_LABELS,
  PromotionDraft,
  PromotionPlacement,
  PromotionPrefill,
  PromotionRecord,
  PromotionServingState,
  PromotionStatus,
  PromotionTargetKind,
} from '../../../core/models/promotion.model';
import { Notifications } from '../../../core/notifications/notifications';
import { fromPickers, toPickers } from '../../../core/time/market-time';
import {
  ConfirmDialog,
  ConfirmDialogData,
} from '../../../shared/components/confirm-dialog/confirm-dialog';
import { ImageUpload } from '../../../shared/components/image-upload/image-upload';
import {
  LocationPicker,
  PinPosition,
} from '../../../shared/components/location-picker/location-picker';
import { Crumb, PageHeader } from '../../../shared/components/page-header/page-header';
import { SearchSelect } from '../../../shared/components/search-select/search-select';
import { PillTone, StatusPill } from '../../../shared/components/status-pill/status-pill';
import { httpsUrl } from '../../../shared/validators/https-url';
import { PromotionFormFacade } from '../promotion-form-facade';

const DAY_MS = 24 * 60 * 60_000;
/** A new booking runs a fortnight unless the admin says otherwise. */
const DEFAULT_PERIOD_DAYS = 14;

const SERVING_TONES: Record<PromotionServingState, PillTone> = {
  live: 'positive',
  upcoming: 'muted',
  draft: 'muted',
  ended: 'muted',
  paused: 'warn',
  'subject-hidden': 'alert',
};

/** The period ends after it starts — the backend's CHECK, said before the round trip. */
function periodInOrder(group: AbstractControl): ValidationErrors | null {
  const { startDate, startTime, endDate, endTime } = group.getRawValue() as {
    startDate: Date | null;
    startTime: Date | null;
    endDate: Date | null;
    endTime: Date | null;
  };
  if (!startDate || !startTime || !endDate || !endTime) return null;
  return fromPickers(endDate, endTime) > fromPickers(startDate, startTime)
    ? null
    : { periodOutOfOrder: true };
}

/**
 * Book a promotion, and change one later. One screen for both.
 *
 * A promotion is a subject, a placement, a period, a creative and a sponsor —
 * the form's sections, in that order — plus a reach, because a Cork bakery's
 * card is wasted on a Dublin buyer. The subject is fixed once booked (another
 * subject is another booking), and the status never moves through the form:
 * on an existing promotion, Schedule / Pause / Resume in the header act at
 * once, so a save can never resume something paused over a complaint.
 *
 * Nothing here picks who sees a card beyond the placement, the markets, the
 * period and the area: promotions are contextual only, never personal.
 */
@Component({
  selector: 'md-promotion-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [PromotionFormFacade],
  imports: [
    RouterLink,
    ReactiveFormsModule,
    ImageUpload,
    LocationPicker,
    PageHeader,
    SearchSelect,
    StatusPill,
    MatButtonModule,
    MatButtonToggleModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatNativeDateModule,
    MatProgressBarModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatTimepickerModule,
    MatTooltipModule,
  ],
  templateUrl: './promotion-form.html',
  styleUrl: './promotion-form.css',
})
export class PromotionForm {
  /** Bound from the route; absent on `/promotions/new`. */
  readonly id = input<string>();
  /** "Promote this event" and friends pre-pick the subject with one of these. */
  readonly eventId = input<string>();
  readonly marketId = input<string>();
  readonly vendorId = input<string>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly media = inject(MediaRepository);
  private readonly notifications = inject(Notifications);

  protected readonly facade = inject(PromotionFormFacade);

  protected readonly targetKinds = PROMOTION_TARGET_KINDS;
  protected readonly targetKindLabels = PROMOTION_TARGET_KIND_LABELS;
  protected readonly placements = PROMOTION_PLACEMENTS;
  protected readonly placementLabels = PROMOTION_PLACEMENT_LABELS;
  protected readonly placementRules = PLACEMENT_RULES;
  protected readonly maxHeadline = MAX_HEADLINE_LENGTH;
  protected readonly maxBody = MAX_BODY_LENGTH;
  protected readonly maxCta = MAX_CTA_LENGTH;
  protected readonly maxRadius = MAX_REACH_RADIUS_KM;

  protected readonly form = this.fb.group(
    {
      targetKind: this.fb.control<PromotionTargetKind>('event'),
      subjectId: this.fb.control<string | null>(null),
      linkUrl: this.fb.control('', httpsUrl),
      placement: this.fb.control<PromotionPlacement>('home-feed'),
      marketIds: this.fb.control<string[]>([]),
      startDate: this.fb.control<Date | null>(null, Validators.required),
      startTime: this.fb.control<Date | null>(null, Validators.required),
      endDate: this.fb.control<Date | null>(null, Validators.required),
      endTime: this.fb.control<Date | null>(null, Validators.required),
      priority: this.fb.control(0, [Validators.required, Validators.min(-100), Validators.max(100)]),
      headline: this.fb.control('', Validators.maxLength(MAX_HEADLINE_LENGTH)),
      body: this.fb.control('', Validators.maxLength(MAX_BODY_LENGTH)),
      ctaLabel: this.fb.control('', Validators.maxLength(MAX_CTA_LENGTH)),
      imageUrl: this.fb.control<string | null>(null),
      sponsorName: this.fb.control('', Validators.required),
      sponsorVendorId: this.fb.control<string | null>(null),
      isHouse: this.fb.control(false),
      isNationwide: this.fb.control(false),
      reachLatitude: this.fb.control<number | null>(null),
      reachLongitude: this.fb.control<number | null>(null),
      reachRadiusKm: this.fb.control(DEFAULT_REACH_RADIUS_KM, [
        Validators.required,
        Validators.min(1),
        Validators.max(MAX_REACH_RADIUS_KM),
      ]),
    },
    { validators: periodInOrder },
  );

  /** What the pickers show; the ids live in the form. */
  protected readonly subject = signal<PickerOption | null>(null);
  protected readonly productVendor = signal<PickerOption | null>(null);
  protected readonly sponsorVendor = signal<PickerOption | null>(null);
  /** The subject's own image and name, which the card falls back to. */
  private readonly subjectImage = signal<string | null>(null);
  protected readonly uploading = signal(false);
  protected readonly reachError = signal<string | null>(null);
  /** True once the admin moved the reach by hand; a new subject then leaves it alone. */
  private reachMoved = false;

  private readonly value = toSignal(
    this.form.valueChanges.pipe(map(() => this.form.getRawValue())),
    { initialValue: this.form.getRawValue() },
  );

  protected readonly isEdit = computed(() => this.id() !== undefined);
  protected readonly targetKind = computed(() => this.value().targetKind);
  protected readonly crumbs = computed<Crumb[]>(() => [
    { label: 'Promotions', link: '/promotions' },
  ]);
  protected readonly heading = computed(() =>
    this.isEdit() ? (this.facade.promotion()?.displayHeadline ?? 'Promotion') : 'New promotion',
  );

  protected readonly placementRule = computed(() => PLACEMENT_RULES[this.value().placement]);

  /** A link has no market to be relevant to, so on a market page it must name some. */
  protected readonly needsMarkets = computed(
    () => this.value().placement === 'market-page' && this.value().targetKind === 'link',
  );

  protected readonly marketsHint = computed(() => {
    if (this.needsMarkets()) return 'A link on a market page must name the markets it is for.';
    if (this.value().placement === 'market-page') {
      return "Leave empty to show it only on the pages of markets the subject is at — a stall can't buy the banner on a rival market's page.";
    }
    return 'Leave empty to serve wherever the reach covers.';
  });

  /** "Sponsored" or "From MarketDay" — what the server will author. */
  protected readonly disclosure = computed(() => (this.value().isHouse ? 'From MarketDay' : 'Sponsored'));

  protected readonly preview = computed(() => {
    const { headline, body, ctaLabel, imageUrl, sponsorName, targetKind } = this.value();
    const subjectName = targetKind === 'link' ? '' : (this.subject()?.label ?? '');
    return {
      headline: headline.trim() || subjectName || 'Headline',
      untitled: !headline.trim() && !subjectName,
      body: body.trim(),
      cta: ctaLabel.trim(),
      imageUrl: imageUrl ?? this.subjectImage(),
      sponsor: sponsorName.trim(),
    };
  });

  protected readonly headlinePlaceholder = computed(() =>
    this.targetKind() === 'link' ? 'Required for a link' : (this.subject()?.label ?? "The subject's name"),
  );

  protected readonly servingState = computed(() => {
    const promotion = this.facade.promotion();
    if (!promotion) return null;
    return {
      label: PROMOTION_SERVING_STATE_LABELS[promotion.servingState],
      hint: PROMOTION_SERVING_STATE_HINTS[promotion.servingState],
      tone: SERVING_TONES[promotion.servingState],
    };
  });

  protected readonly periodEnded = computed(() => {
    const promotion = this.facade.promotion();
    return promotion ? promotion.endsAt.getTime() <= Date.now() : false;
  });

  constructor() {
    effect(() => this.facade.load(this.id() ?? null, this.prefill()));
    effect(() => {
      const form = this.facade.form();
      if (form) this.seed(form.promotion);
    });
    // A new subject resets what depended on the old one.
    this.form.controls.targetKind.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      if (this.isEdit()) return;
      this.form.controls.subjectId.setValue(null);
      this.subject.set(null);
      this.productVendor.set(null);
      this.subjectImage.set(null);
      this.facade.loadProducts(null);
    });
  }

  private prefill(): PromotionPrefill | null {
    const eventId = this.eventId();
    if (eventId) return { kind: 'event', id: eventId };
    const marketId = this.marketId();
    if (marketId) return { kind: 'market', id: marketId };
    const vendorId = this.vendorId();
    if (vendorId) return { kind: 'vendor', id: vendorId };
    return null;
  }

  /* ── Subject ───────────────────────────────────────────────────────────── */

  protected onSubjectPicked(option: PickerOption): void {
    this.subject.set(option);
    this.form.controls.subjectId.setValue(option.id);
    this.subjectImage.set(null);
    this.form.markAsDirty();
    const kind = this.form.controls.targetKind.value;
    this.centreReachOn(kind, option.id);
    // A vendor promoting itself is usually its own sponsor; say so unless told otherwise.
    if (kind === 'vendor') this.suggestSponsor(option);
  }

  protected onSubjectCleared(): void {
    this.subject.set(null);
    this.form.controls.subjectId.setValue(null);
  }

  protected onMarketSubjectPicked(marketId: string): void {
    const market = this.facade.markets().find((option) => option.id === marketId);
    this.subject.set(market ? { id: market.id, label: market.name, detail: '' } : null);
    this.centreReachOn('market', marketId);
  }

  protected onProductVendorPicked(option: PickerOption): void {
    this.productVendor.set(option);
    this.onSubjectCleared();
    this.facade.loadProducts(option.id);
    this.suggestSponsor(option);
  }

  protected onProductVendorCleared(): void {
    this.productVendor.set(null);
    this.onSubjectCleared();
    this.facade.loadProducts(null);
  }

  protected onProductPicked(productId: string): void {
    const product = this.facade.products().find((option) => option.id === productId);
    this.subject.set(product ?? null);
    this.centreReachOn('product', productId);
  }

  private suggestSponsor(vendor: PickerOption): void {
    const { sponsorName, sponsorVendorId, isHouse } = this.form.controls;
    if (sponsorName.value.trim() || isHouse.value) return;
    sponsorName.setValue(vendor.label);
    sponsorVendorId.setValue(vendor.id);
    this.sponsorVendor.set(vendor);
  }

  /* ── Sponsor ───────────────────────────────────────────────────────────── */

  protected onSponsorPicked(option: PickerOption): void {
    this.sponsorVendor.set(option);
    this.form.controls.sponsorVendorId.setValue(option.id);
    this.form.controls.sponsorName.setValue(option.label);
    this.form.markAsDirty();
  }

  protected onSponsorCleared(): void {
    this.sponsorVendor.set(null);
    this.form.controls.sponsorVendorId.setValue(null);
    this.form.markAsDirty();
  }

  /** The platform promoting itself: no vendor behind it, and labelled as such. */
  protected onHouseToggled(isHouse: boolean): void {
    if (!isHouse) return;
    this.onSponsorCleared();
    if (!this.form.controls.sponsorName.value.trim()) {
      this.form.controls.sponsorName.setValue('MarketDay');
    }
  }

  /* ── Reach ─────────────────────────────────────────────────────────────── */

  /** Centres the reach on the subject, unless the admin has already placed it. */
  private centreReachOn(kind: PromotionTargetKind, id: string): void {
    if (this.reachMoved) return;
    this.facade.suggestedReach(kind, id, (point) => {
      if (!point || this.reachMoved) return;
      this.form.controls.reachLatitude.setValue(point.latitude);
      this.form.controls.reachLongitude.setValue(point.longitude);
      this.reachError.set(null);
    });
  }

  protected onReachMoved({ lat, lng }: PinPosition): void {
    this.reachMoved = true;
    this.form.controls.reachLatitude.setValue(lat);
    this.form.controls.reachLongitude.setValue(lng);
    this.form.markAsDirty();
    this.reachError.set(null);
  }

  /** Back to the subject's point, after a hand-placed centre. */
  protected recentre(): void {
    const { targetKind, subjectId } = this.form.getRawValue();
    if (!subjectId || targetKind === 'link') return;
    this.reachMoved = false;
    this.centreReachOn(targetKind, subjectId);
  }

  /* ── Image ─────────────────────────────────────────────────────────────── */

  protected onImagePicked(file: File): void {
    this.uploading.set(true);
    this.media.upload(file, 'promotion-image').subscribe({
      next: (uploaded) => {
        this.uploading.set(false);
        this.form.controls.imageUrl.setValue(uploaded.url);
        this.form.markAsDirty();
      },
      error: () => {
        this.uploading.set(false);
        this.notifications.error("That image didn't upload. Try again.");
      },
    });
  }

  protected onImageCleared(): void {
    this.form.controls.imageUrl.setValue(null);
    this.form.markAsDirty();
  }

  protected onImageRejected(reason: string): void {
    this.notifications.error(reason);
  }

  /* ── Saving ────────────────────────────────────────────────────────────── */

  /** Why the form can't be saved yet, in one sentence — or `null`. */
  private problem(): string | null {
    const v = this.form.getRawValue();
    if (v.targetKind === 'link') {
      if (!v.linkUrl.trim() || this.form.controls.linkUrl.invalid) return 'Give the link as a full https:// address.';
      if (!v.headline.trim()) return 'A link has no name of its own — write a headline.';
    } else if (!v.subjectId) {
      return `Choose the ${PROMOTION_TARGET_KIND_LABELS[v.targetKind].toLowerCase()} to promote.`;
    }
    if (this.needsMarkets() && v.marketIds.length === 0) {
      return 'A link on a market page must name the markets it is for.';
    }
    if (this.form.hasError('periodOutOfOrder')) return 'The period must end after it starts.';
    if (!v.isNationwide && v.reachLatitude === null) {
      this.reachError.set('Place the centre of the reach, or make it nationwide.');
      return 'Set the reach, or make the promotion nationwide.';
    }
    if (this.form.invalid) return 'Fill in the period, the sponsor and the creative before saving.';
    return null;
  }

  protected save(schedule = false): void {
    const problem = this.problem();
    if (problem) {
      this.form.markAllAsTouched();
      this.notifications.error(problem);
      return;
    }
    this.facade.save(this.draft(schedule ? 'scheduled' : 'draft'), (saved) => {
      if (!saved) {
        this.notifications.error(this.facade.error() ?? "Those changes didn't save.");
        return;
      }
      this.form.markAsPristine();
      if (this.isEdit()) {
        this.notifications.success(`${saved.displayHeadline} is saved.`);
        return;
      }
      this.notifications.success(
        schedule
          ? `${saved.displayHeadline} is scheduled.`
          : `${saved.displayHeadline} is saved as a draft. Schedule it when it has been reviewed.`,
      );
      void this.router.navigate(['/promotions', saved.id], { replaceUrl: true });
    });
  }

  protected setStatus(status: PromotionStatus): void {
    const said: Record<PromotionStatus, string> = {
      scheduled: 'is scheduled.',
      paused: 'is paused. It stops serving straight away.',
      draft: 'is back to draft.',
    };
    this.facade.setStatus(status, (saved) => {
      if (!saved) {
        this.notifications.error(this.facade.error() ?? 'That status change was refused.');
        return;
      }
      this.notifications.success(`${saved.displayHeadline} ${said[status]}`);
    });
  }

  protected confirmDelete(): void {
    const promotion = this.facade.promotion();
    if (!promotion) return;
    const data: ConfirmDialogData = {
      title: `Delete ${promotion.displayHeadline}?`,
      body:
        'The booking is removed for good. To stop it serving for now — a complaint, a dispute — ' +
        'pause it instead.',
      confirmLabel: 'Delete promotion',
    };
    this.dialog
      .open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, { data })
      .afterClosed()
      .subscribe((confirmed) => {
        if (!confirmed) return;
        this.facade.remove((removed) => {
          if (!removed) {
            this.notifications.error(this.facade.error() ?? "That promotion wasn't deleted.");
            return;
          }
          this.notifications.success(`${promotion.displayHeadline} is deleted.`);
          void this.router.navigate(['/promotions']);
        });
      });
  }

  /* ── Helpers ───────────────────────────────────────────────────────────── */

  private draft(status: 'draft' | 'scheduled'): PromotionDraft {
    const v = this.form.getRawValue();
    return {
      subject: { kind: v.targetKind, id: v.targetKind === 'link' ? null : v.subjectId },
      linkUrl: v.linkUrl.trim(),
      placement: v.placement,
      status,
      startsAt: fromPickers(v.startDate!, v.startTime!),
      endsAt: fromPickers(v.endDate!, v.endTime!),
      priority: v.priority,
      headline: v.headline,
      body: v.body,
      imageUrl: v.imageUrl,
      ctaLabel: v.ctaLabel,
      sponsorName: v.sponsorName,
      sponsorVendorId: v.isHouse ? null : v.sponsorVendorId,
      isHouse: v.isHouse,
      isNationwide: v.isNationwide,
      reach:
        v.isNationwide || v.reachLatitude === null || v.reachLongitude === null
          ? null
          : { latitude: v.reachLatitude, longitude: v.reachLongitude, radiusKm: v.reachRadiusKm },
      marketIds: v.marketIds,
    };
  }

  private seed(promotion: PromotionRecord | null): void {
    const now = new Date();
    const start = toPickers(promotion?.startsAt ?? now);
    const end = toPickers(promotion?.endsAt ?? new Date(now.getTime() + DEFAULT_PERIOD_DAYS * DAY_MS));
    const prefilled = promotion ? null : this.facade.prefilled();
    const subject = promotion?.subject ?? prefilled;

    this.form.reset(
      {
        targetKind: subject?.kind ?? 'event',
        subjectId: subject?.id ?? null,
        linkUrl: promotion?.linkUrl ?? '',
        placement: promotion?.placement ?? 'home-feed',
        marketIds: [...(promotion?.marketIds ?? [])],
        startDate: start.date,
        startTime: promotion ? start.time : new Date(now.getFullYear(), 0, 1, 0, 0),
        endDate: end.date,
        endTime: promotion ? end.time : new Date(now.getFullYear(), 0, 1, 23, 45),
        priority: promotion?.priority ?? 0,
        headline: promotion?.headline ?? '',
        body: promotion?.body ?? '',
        ctaLabel: promotion?.ctaLabel ?? '',
        imageUrl: promotion?.imageUrl ?? null,
        sponsorName: promotion?.sponsorName ?? '',
        sponsorVendorId: promotion?.sponsorVendorId ?? null,
        isHouse: promotion?.isHouse ?? false,
        isNationwide: promotion?.isNationwide ?? false,
        reachLatitude: promotion?.reach?.latitude ?? null,
        reachLongitude: promotion?.reach?.longitude ?? null,
        reachRadiusKm: promotion?.reach?.radiusKm ?? DEFAULT_REACH_RADIUS_KM,
      },
      { emitEvent: false },
    );
    this.form.updateValueAndValidity();

    this.subject.set(subject?.id ? { id: subject.id, label: subject.name, detail: '' } : null);
    this.subjectImage.set(subject?.imageUrl ?? null);
    this.sponsorVendor.set(
      promotion?.sponsorVendorId
        ? { id: promotion.sponsorVendorId, label: promotion.sponsorName, detail: '' }
        : null,
    );
    // A stored reach was placed on purpose; a new one follows the subject.
    this.reachMoved = promotion !== null;

    if (promotion) {
      // Another subject is another booking.
      this.form.controls.targetKind.disable({ emitEvent: false });
    } else if (prefilled?.id) {
      this.centreReachOn(prefilled.kind, prefilled.id);
      if (prefilled.kind === 'vendor') {
        this.suggestSponsor({ id: prefilled.id, label: prefilled.name, detail: '' });
      }
    }
  }
}
