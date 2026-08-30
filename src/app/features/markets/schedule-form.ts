import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  isDevMode,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import {
  AbstractControl,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTimepickerModule } from '@angular/material/timepicker';
import { MarketSchedulePatch } from '../../core/models/market.model';
import {
  RecurrenceEnd,
  RecurrenceFrequency,
  composeSchedule,
  describeSchedule,
  durationMinutes,
  formatTimeOfDay,
  nextOccurrence,
  parseSchedule,
  parseTimeOfDay,
} from '../../core/scheduling/recurrence';

export const TRADING_DAYS = [
  { value: 1, short: 'M', label: 'Monday' },
  { value: 2, short: 'T', label: 'Tuesday' },
  { value: 3, short: 'W', label: 'Wednesday' },
  { value: 4, short: 'T', label: 'Thursday' },
  { value: 5, short: 'F', label: 'Friday' },
  { value: 6, short: 'S', label: 'Saturday' },
  { value: 7, short: 'S', label: 'Sunday' },
];

/** The "Repeats" control: the FREQ/INTERVAL half of the rule, in plain words. */
export const FREQUENCIES: readonly { value: RecurrenceFrequency; label: string }[] = [
  { value: 'WEEKLY', label: 'Every week' },
  { value: 'FORTNIGHTLY', label: 'Every 2 weeks' },
  { value: 'MONTHLY', label: 'Every month' },
];

type EndKind = RecurrenceEnd['kind'];

/** Trading days is an array control, and `Validators.required` passes on `[]`. */
function nonEmptyArray(control: AbstractControl): ValidationErrors | null {
  return Array.isArray(control.value) && control.value.length ? null : { required: true };
}

/**
 * Closing must come after opening, or `duration` is zero or negative — which
 * the API rejects (`@IsPositive`) rather than storing a market that never ends.
 */
function tradingWindow(group: AbstractControl): ValidationErrors | null {
  const { opensAt, closesAt } = group.value as { opensAt: Date | null; closesAt: Date | null };
  const open = formatTimeOfDay(opensAt);
  const close = formatTimeOfDay(closesAt);
  if (!open || !close) return null;
  return durationMinutes(open, close) > 0 ? null : { tradingWindow: true };
}

function applyEndKind(form: ScheduleFormGroup, kind: EndKind): void {
  const { endsOn, endsAfter } = form.controls;
  const options = { emitEvent: false };
  kind === 'ON' ? endsOn.enable(options) : endsOn.disable(options);
  kind === 'AFTER' ? endsAfter.enable(options) : endsAfter.disable(options);
}

export type ScheduleFormGroup = FormGroup<{
  frequency: FormControl<RecurrenceFrequency>;
  tradingDays: FormControl<number[]>;
  startsOn: FormControl<Date | null>;
  ends: FormControl<EndKind>;
  endsOn: FormControl<Date | null>;
  endsAfter: FormControl<number | null>;
  opensAt: FormControl<Date | null>;
  closesAt: FormControl<Date | null>;
  bookingDeadlineHours: FormControl<number>;
}>;
export type ScheduleFormValue = ReturnType<ScheduleFormGroup['getRawValue']>;

/**
 * The group both the wizard's schedule step and the detail schedule tab bind
 * to. Called from a field initialiser (the default `fb` argument), so
 * `inject()` and `takeUntilDestroyed()` resolve against the calling component.
 */
export function createScheduleForm(fb: FormBuilder = inject(FormBuilder)): ScheduleFormGroup {
  const form = fb.nonNullable.group(
    {
      frequency: fb.nonNullable.control<RecurrenceFrequency>('WEEKLY'),
      tradingDays: fb.nonNullable.control<number[]>([], nonEmptyArray),
      startsOn: fb.nonNullable.control<Date | null>(null, Validators.required),
      ends: fb.nonNullable.control<EndKind>('NEVER'),
      endsOn: fb.nonNullable.control<Date | null>({ value: null, disabled: true }, [
        Validators.required,
      ]),
      endsAfter: fb.nonNullable.control<number | null>({ value: 12, disabled: true }, [
        Validators.required,
        Validators.min(1),
      ]),
      opensAt: fb.nonNullable.control<Date | null>(parseTimeOfDay('09:00'), Validators.required),
      closesAt: fb.nonNullable.control<Date | null>(parseTimeOfDay('15:00'), Validators.required),
      bookingDeadlineHours: fb.nonNullable.control<number>(48),
    },
    { validators: tradingWindow },
  );

  // "Ends" carries a companion control; keeping the unused ones disabled is
  // what stops their `required` validators from blocking the group.
  form.controls.ends.valueChanges
    .pipe(takeUntilDestroyed())
    .subscribe((kind) => applyEndKind(form, kind));

  return form;
}

function recurrenceEnd(value: ScheduleFormValue): RecurrenceEnd {
  const { ends, endsOn, endsAfter } = value;
  if (ends === 'ON' && endsOn) return { kind: 'ON', date: endsOn };
  if (ends === 'AFTER' && endsAfter) return { kind: 'AFTER', count: endsAfter };
  return { kind: 'NEVER' };
}

/** The composed RRULE for the group's current raw value, or `''` while incomplete. */
export function composeFrom(value: ScheduleFormValue): string {
  if (!value.startsOn) return '';
  return composeSchedule({
    frequency: value.frequency,
    tradingDays: value.tradingDays,
    startsOn: value.startsOn,
    opensAt: formatTimeOfDay(value.opensAt),
    ends: recurrenceEnd(value),
  });
}

/**
 * The fields a caller persists: the rule itself, the derived duration, and
 * the raw days/hours the four controls collapse into. Shared by the wizard's
 * draft and the detail tab's save so the two payloads never diverge.
 */
export function scheduleFields(value: ScheduleFormValue): MarketSchedulePatch {
  const opensAt = formatTimeOfDay(value.opensAt);
  const closesAt = formatTimeOfDay(value.closesAt);
  return {
    schedule: composeFrom(value),
    duration: durationMinutes(opensAt, closesAt),
    tradingDays: [...value.tradingDays],
    opensAt,
    closesAt,
    bookingDeadlineHours: value.bookingDeadlineHours,
  };
}

/**
 * The wizard's schedule step and the detail tab's trading-pattern editor,
 * extracted so both bind the same `FormGroup` and compose the same RRULE.
 * Presentation only in the CVA sense that it never talks to a repository —
 * whoever owns the form decides what happens on save.
 */
@Component({
  selector: 'md-market-schedule-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatButtonToggleModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTimepickerModule,
  ],
  templateUrl: './schedule-form.html',
  styleUrl: './schedule-form.css',
})
export class MarketScheduleForm {
  readonly form = input.required<ScheduleFormGroup>();
  /** Dev-only RFC 5545 read-back. An input so the wizard's tests can turn it off. */
  readonly showRepeatRule = input(isDevMode());

  protected readonly tradingDays = TRADING_DAYS;
  protected readonly frequencies = FREQUENCIES;

  private readonly revision = signal(0);
  /**
   * The raw value, re-read on every change so *disabled* `endsOn`/`endsAfter`
   * stay visible to `schedule()` — `getRawValue()`, not `value`, is what makes
   * `UNTIL`/`COUNT` show up once "Ends" is set.
   */
  protected readonly value = computed(() => (this.revision(), this.form().getRawValue()));

  constructor() {
    effect((onCleanup) => {
      const sub = this.form().valueChanges.subscribe(() => this.revision.update((n) => n + 1));
      onCleanup(() => sub.unsubscribe());
    });
  }

  /**
   * The composed rule, rebuilt on every keystroke. This — not a text field —
   * is the only place an RRULE is written; the dev panel shows it back
   * read-only so the RFC 5545 stays visible without ever being typed.
   */
  protected readonly schedule = computed(() => composeFrom(this.value()));

  /** "Every 2 weeks on Saturday, Sunday until December 31, 2026". */
  protected readonly scheduleDescription = computed(() => describeSchedule(this.schedule()));

  /** The date the rule actually starts, which is not always "Starts on". */
  protected readonly firstMarketDay = computed(() => nextOccurrence(this.schedule()));

  /**
   * The earliest closing time the "Closes" picker will offer or accept. A
   * minute past opening rather than opening itself, because a market that
   * closes when it opens has no duration — which is what `tradingWindow`
   * guards on the way out, and this is the same rule said early, in the
   * control.
   */
  protected readonly earliestClosing = computed(() => {
    const opensAt = this.value().opensAt;
    return opensAt ? new Date(opensAt.getTime() + 60_000) : null;
  });

  protected toggleDay(day: number): void {
    const control = this.form().controls.tradingDays;
    const current = control.value;
    control.setValue(
      current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort(),
    );
    control.markAsDirty();
  }

  protected isDaySelected(day: number): boolean {
    return this.value().tradingDays.includes(day);
  }
}
