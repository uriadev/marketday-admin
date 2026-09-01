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
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTimepickerModule } from '@angular/material/timepicker';
import { MarketSchedulePatch } from '../../../core/models/market.model';
import {
  RecurrenceEnd,
  RecurrenceFrequency,
  ScheduleGap,
  composeSchedule,
  describeSchedule,
  durationMinutes,
  expandSchedule,
  formatTimeOfDay,
  nextOccurrence,
  parseTimeOfDay,
} from '../../../core/scheduling/recurrence';

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
  };
}

/**
 * The inverse of {@link scheduleFields}: seeds the group from a stored pattern.
 *
 * `reset()` writes values but not control state, so the "Ends" enable/disable —
 * the thing that keeps the unused companion control's `required` from blocking
 * the group — is re-applied here rather than left to the subscription.
 *
 * The group is left pristine: a loaded pattern is the form's new baseline, not
 * an edit of it.
 *
 * Returns what {@link expandSchedule} could not fit into the four controls, for
 * the host to hand back to {@link MarketScheduleForm.gaps} — empty for any rule
 * this console wrote. The stored `opensAt` / `closesAt` win over the rule's own
 * `DTSTART` time, because the patch carries the market's `duration` and the rule
 * does not: closing time exists nowhere else.
 */
export function seedScheduleForm(
  form: ScheduleFormGroup,
  stored: MarketSchedulePatch,
): readonly ScheduleGap[] {
  const expanded = expandSchedule(stored.schedule);
  const recurrence = expanded?.recurrence;
  const ends: RecurrenceEnd = recurrence?.ends ?? { kind: 'NEVER' };
  const days = recurrence?.tradingDays.length ? recurrence.tradingDays : stored.tradingDays;

  form.reset({
    frequency: recurrence?.frequency ?? 'WEEKLY',
    tradingDays: [...days],
    startsOn: recurrence?.startsOn ?? null,
    ends: ends.kind,
    endsOn: ends.kind === 'ON' ? ends.date : null,
    endsAfter: ends.kind === 'AFTER' ? ends.count : 12,
    opensAt: parseTimeOfDay(stored.opensAt) ?? parseTimeOfDay(recurrence?.opensAt ?? ''),
    closesAt: parseTimeOfDay(stored.closesAt),
  });
  applyEndKind(form, ends.kind);
  return expanded?.gaps ?? [];
}

/**
 * What each gap costs the organiser, in the terms the editor speaks. Read out
 * in the notice above the controls whenever a stored rule needed approximating
 * — saving replaces that rule with whatever these controls hold, so the notice
 * is the one chance to say what is about to be dropped.
 */
export const SCHEDULE_GAP_NOTES: Readonly<Record<ScheduleGap, string>> = {
  frequency: 'it repeats on a cycle this editor has no option for, shown as the nearest one',
  startsOn:
    'it carries no start date — it is read as starting today, which is how the API reads it too',
  opensAt: 'it carries no opening time — set one, and closing follows from the stored duration',
  tradingDays: 'it repeats by date rather than by weekday, so the days shown are approximate',
  restrictions: 'it carries extra conditions these controls cannot show',
};

/**
 * The wizard's schedule step and the detail tab's trading-pattern editor,
 * extracted so both bind the same `FormGroup` and compose the same RRULE.
 * Presentation only in the CVA sense that it never talks to a repository —
 * whoever owns the form decides what happens on save.
 *
 * `showErrors()` is public for the same reason `MarketLocationForm`'s
 * `flagMissingPin()` is: `markAllAsTouched()` emits no value change, so this
 * component has no reactive way to notice that its host has decided to raise
 * the errors. The host reaches in via `viewChild` and says so.
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
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTimepickerModule,
  ],
  templateUrl: './schedule-form.html',
  styleUrl: './schedule-form.css',
})
export class MarketScheduleForm {
  readonly form = input.required<ScheduleFormGroup>();
  /**
   * What the stored rule held that these controls could not take, as returned by
   * {@link seedScheduleForm}. Empty for a rule this console wrote, which is the
   * normal case — the notice only appears for a pattern that arrived some other
   * way and would be quietly rewritten by the next save.
   */
  readonly gaps = input<readonly ScheduleGap[]>([]);
  /**
   * The market's stored trading duration, in minutes.
   *
   * Closing time is not a stored field anywhere: the API keeps `duration`, and
   * "Closes" is only ever "Opens" plus that — which is why {@link toSchedulePatch}
   * derives one from the other and {@link scheduleFields} derives it back. So a
   * rule that arrived without a `DTSTART` time still knows how long the market
   * runs, and closing follows the moment an organiser sets an opening time.
   */
  readonly durationMinutes = input(0);
  /** Dev-only RFC 5545 read-back. An input so the wizard's tests can turn it off. */
  readonly showRepeatRule = input(isDevMode());

  /** The gaps as sentences, for the notice above the controls. */
  protected readonly gapNotes = computed(() => this.gaps().map((gap) => SCHEDULE_GAP_NOTES[gap]));

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

    // Closing time follows opening plus the stored duration. Only ever fills a
    // blank — the one case being a pattern seeded from a rule with no opening
    // time to anchor it — so it never argues with an organiser who set one.
    effect(() => {
      const minutes = this.durationMinutes();
      const { opensAt, closesAt } = this.value();
      if (minutes <= 0 || closesAt || !opensAt) return;
      this.form().controls.closesAt.setValue(new Date(opensAt.getTime() + minutes * 60_000));
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

  /**
   * Repaint the errors after the host has called `markAllAsTouched()`. Touching
   * a control changes no value, so without this the editor would report a
   * refused save with every field still looking fine.
   */
  showErrors(): void {
    this.revision.update((n) => n + 1);
  }

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
