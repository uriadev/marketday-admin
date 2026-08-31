import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatStepperModule } from '@angular/material/stepper';
import { MarketRepository } from '../../../core/api/ports/market-repository';
import { MarketDraft } from '../../../core/models/market.model';
import { describeSchedule, formatTimeOfDay } from '../../../core/scheduling/recurrence';
import { Notifications } from '../../../core/notifications/notifications';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { Avatar } from '../../../shared/components/avatar/avatar';
import {
  MarketScheduleForm,
  composeFrom,
  createScheduleForm,
  scheduleFields,
} from '../schedule-form/schedule-form';
import { MarketDetailsForm, createDetailsForm, detailsFields } from '../details-form/details-form';
import {
  MarketLocationForm,
  createLocationForm,
  locationFields,
} from '../location-form/location-form';

const STEPS = ['details', 'schedule', 'location'] as const;
type StepName = (typeof STEPS)[number];

const STEP_LABELS: Record<StepName, string> = {
  details: 'Details',
  schedule: 'Schedule',
  location: 'Location',
};

/**
 * Add market · three steps in a `mat-stepper` (design 1h).
 *
 * Each step is a separate form group so "Continue" can validate exactly one
 * step, and the step lives in `?step=` so an organiser can bookmark or reload
 * mid-wizard — the design's requirement, and the reason this is a Command-style
 * navigation rather than hidden component state.
 */
@Component({
  selector: 'md-market-wizard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatStepperModule,
    PageHeader,
    Avatar,
    MarketScheduleForm,
    MarketDetailsForm,
    MarketLocationForm,
  ],
  templateUrl: './market-wizard.html',
  styleUrl: './market-wizard.css',
})
export class MarketWizard {
  private readonly fb = inject(FormBuilder);
  private readonly repository = inject(MarketRepository);
  private readonly notifications = inject(Notifications);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /**
   * Name, slug, type, description, images, stalls and the two toggles. Nobody
   * uploads through a raw input; `MarketDetailsForm` owns the `MediaRepository`
   * round trip.
   */
  protected readonly detailsForm = createDetailsForm(this.fb);

  /**
   * The four controls that make the RRULE — repeats, trading days, starts on,
   * ends — plus the opening hours that fix `DTSTART`'s time and the market's
   * duration. Nobody types RFC 5545; the string is composed by `MarketScheduleForm`.
   */
  protected readonly scheduleForm = createScheduleForm(this.fb);

  /**
   * Address, the town it is in, and the point the API stores. `latitude` and
   * `longitude` are `required` because `CreateMarketInput` requires them, and
   * they have no field of their own — `MarketLocationForm`'s map picker is the
   * only thing that writes them.
   */
  protected readonly locationForm = createLocationForm(this.fb);

  /**
   * `flagMissingPin()` lives on the step, not the wizard — coordinates have no
   * `mat-form-field` of their own, and this is how `goNext()`/`publish()` still
   * raise that error at the right moment.
   */
  private readonly locationFormRef = viewChild(MarketLocationForm);

  protected readonly savedAt = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly stepIndex = signal(this.indexFromUrl());

  /**
   * Raw value of each step as a signal. `valueChanges` emits the partial value,
   * so the raw value is re-read on every tick — that keeps the preview and the
   * checklist fully typed and, unlike reading the form inside a `computed()`,
   * actually recomputes when the organiser types.
   */
  private readonly detailsValue = toSignal(
    this.detailsForm.valueChanges.pipe(map(() => this.detailsForm.getRawValue())),
    { initialValue: this.detailsForm.getRawValue() },
  );
  private readonly scheduleValue = toSignal(
    this.scheduleForm.valueChanges.pipe(map(() => this.scheduleForm.getRawValue())),
    { initialValue: this.scheduleForm.getRawValue() },
  );
  private readonly locationValue = toSignal(
    this.locationForm.valueChanges.pipe(map(() => this.locationForm.getRawValue())),
    { initialValue: this.locationForm.getRawValue() },
  );

  /**
   * The composed rule, rebuilt on every keystroke. `MarketScheduleForm` renders
   * this same value back read-only in its dev panel; the wizard needs it too,
   * for the draft payload and the listing preview.
   */
  protected readonly schedule = computed(() => composeFrom(this.scheduleValue()));

  /** Live listing preview on the right of the wizard. */
  protected readonly preview = computed(() => {
    const details = this.detailsValue();
    const location = this.locationValue();
    return {
      name: details.name || 'Untitled market',
      location: [location.city || location.county, this.scheduleSummary()]
        .filter(Boolean)
        .join(' · '),
      stalls: `0/${details.stallCount ?? 0}`,
      fee: details.stallFeePerDay !== null ? `€${details.stallFeePerDay}` : '—',
      imageUrl: details.imageUrl,
    };
  });

  protected readonly checklist = computed(() => {
    const details = this.detailsValue();
    const location = this.locationValue();
    return [
      {
        label: 'Name, address and hours',
        done: !!details.name && !!location.address && location.latitude !== null,
      },
      {
        label: 'Stall count and fee',
        done: details.stallCount !== null && details.stallFeePerDay !== null,
      },
      { label: 'Cover photo', done: !!details.imageUrl },
      { label: 'Banner image', done: !!details.bannerUrl },
      { label: 'Organiser phone number', done: !!location.organiserPhone },
    ];
  });

  /** The design's amber note: who hears about this market the moment it goes live. */
  protected readonly publishNote = computed(() => {
    const where = this.locationValue().city || this.locationValue().county;
    return where
      ? `Publishing emails the vendors within 30km of ${where} who asked to hear about new markets.`
      : 'Publishing emails nearby vendors who asked to hear about new markets.';
  });

  protected readonly stepName = computed(() => STEPS[this.stepIndex()] ?? 'details');
  protected readonly stepLabel = computed(() => STEP_LABELS[this.stepName()]);

  private get stepForms() {
    return [this.detailsForm, this.scheduleForm, this.locationForm];
  }

  /**
   * Back/Continue live in the footer bar, outside `<mat-stepper>`, so the
   * `matStepperNext`/`matStepperPrevious` directives have no `CdkStepper` to
   * inject. Moving the step index here keeps the footer where the design puts
   * it and keeps `?step=` the single source of truth.
   */
  protected goNext(): void {
    const current = this.stepForms[this.stepIndex()];
    if (current?.invalid) {
      current.markAllAsTouched();
      this.locationFormRef()?.flagMissingPin();
      this.notifications.error('Fill in the required fields before continuing.');
      return;
    }
    this.onStepChange(Math.min(2, this.stepIndex() + 1));
  }

  protected goBack(): void {
    this.onStepChange(Math.max(0, this.stepIndex() - 1));
  }

  protected scheduleSummary(): string {
    const description = describeSchedule(this.schedule());
    if (!description) return '';
    const { opensAt, closesAt } = this.scheduleValue();
    return `${description} · ${formatTimeOfDay(opensAt)}–${formatTimeOfDay(closesAt)}`;
  }

  protected onStepChange(index: number): void {
    this.stepIndex.set(index);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { step: STEPS[index] },
      replaceUrl: true,
    });
    this.autosave();
  }

  protected saveDraft(): void {
    this.persist('DRAFT');
  }

  protected publish(): void {
    if (this.detailsForm.invalid || this.scheduleForm.invalid || this.locationForm.invalid) {
      this.detailsForm.markAllAsTouched();
      this.scheduleForm.markAllAsTouched();
      this.locationForm.markAllAsTouched();
      this.locationFormRef()?.flagMissingPin();
      this.notifications.error('Some required details are still missing.');
      return;
    }
    this.persist('PUBLISHED');
  }

  /** Quietly keeps the draft current as the organiser moves between steps. */
  private autosave(): void {
    if (!this.detailsForm.controls.name.value) return;
    this.repository.saveDraft(this.draft()).subscribe({
      next: () => this.savedAt.set('just now'),
      // An autosave that fails is not worth interrupting anyone over; the
      // explicit "Save as draft" reports properly.
      error: () => {},
    });
  }

  private persist(status: 'DRAFT' | 'PUBLISHED'): void {
    this.saving.set(true);
    const request =
      status === 'DRAFT'
        ? this.repository.saveDraft(this.draft())
        : this.repository.publish(this.draft());

    request.subscribe({
      next: (market) => {
        this.saving.set(false);
        this.savedAt.set('just now');
        if (status === 'PUBLISHED') {
          this.notifications.success(`${market.name} is published.`);
          void this.router.navigate(['/markets', market.slug]);
        } else {
          this.notifications.info('Draft saved.');
        }
      },
      error: () => {
        this.saving.set(false);
        this.notifications.error("That didn't save. Try again.");
      },
    });
  }

  private draft(): MarketDraft {
    return {
      ...detailsFields(this.detailsForm.getRawValue()),
      ...locationFields(this.locationForm.getRawValue()),
      ...scheduleFields(this.scheduleForm.getRawValue()),
    };
  }

  private indexFromUrl(): number {
    const step = this.route.snapshot.queryParamMap.get('step') as StepName | null;
    const index = step ? STEPS.indexOf(step) : 0;
    return index >= 0 ? index : 0;
  }
}
