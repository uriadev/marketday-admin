import { ComponentFixture, TestBed } from '@angular/core/testing';
import { parseTimeOfDay } from '../../core/scheduling/recurrence';
import { MarketScheduleForm, ScheduleFormGroup, createScheduleForm } from './schedule-form';

/**
 * The schedule form's job is to write a valid RRULE without ever showing an
 * organiser one to type. These tests drive the four controls and read back
 * both what the form renders and the group's raw value.
 */
describe('MarketScheduleForm', () => {
  let fixture: ComponentFixture<MarketScheduleForm>;
  let group: ScheduleFormGroup;

  /** Saturday 5 September 2026 — the first Saturday of that month. */
  const SATURDAY = new Date(2026, 8, 5);

  // Protected members: index access is the sanctioned way to reach them.
  const schedule = () => fixture.componentInstance['schedule']();

  function fillSchedule(overrides: Record<string, unknown> = {}): void {
    group.patchValue({
      frequency: 'WEEKLY',
      tradingDays: [6],
      startsOn: SATURDAY,
      opensAt: parseTimeOfDay('09:00'),
      closesAt: parseTimeOfDay('14:30'),
      ...overrides,
    });
    fixture.detectChanges();
  }

  function previewText(): string {
    return fixture.nativeElement.querySelector('.schedule-form__rule')?.textContent ?? '';
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [MarketScheduleForm] });
    group = TestBed.runInInjectionContext(() => createScheduleForm());
    fixture = TestBed.createComponent(MarketScheduleForm);
    fixture.componentRef.setInput('form', group);
    fixture.detectChanges();
  });

  it('composes a weekly rule from the four controls', () => {
    fillSchedule();
    expect(schedule()).toBe('DTSTART:20260905T090000Z\nRRULE:FREQ=WEEKLY;BYDAY=SA');
  });

  it('shows the rule in words and in RFC 5545, without a field to type it in', () => {
    fillSchedule();
    expect(previewText()).toContain('Every week on Saturday');
    expect(previewText()).toContain('RRULE:FREQ=WEEKLY;BYDAY=SA');
    expect(previewText()).toContain('First market day Saturday 5 September 2026');

    const inputs = [...fixture.nativeElement.querySelectorAll('input')] as HTMLInputElement[];
    expect(inputs.some((input) => (input.value ?? '').includes('RRULE'))).toBe(false);
  });

  it('prompts instead of showing a rule while the form is incomplete', () => {
    expect(schedule()).toBe('');
    expect(previewText()).toContain('Pick the trading days and a start date');
  });

  it('rewrites the rule as the repeat changes', () => {
    fillSchedule({ frequency: 'FORTNIGHTLY', tradingDays: [6, 7] });
    expect(schedule()).toContain('FREQ=WEEKLY;INTERVAL=2;BYDAY=SA,SU');

    fillSchedule({ frequency: 'MONTHLY' });
    expect(schedule()).toContain('FREQ=MONTHLY;BYDAY=+1SA');
    expect(previewText()).toContain('Every month on the 1st Saturday');
  });

  it('only asks for an end value once an end is chosen', () => {
    fillSchedule();
    expect(group.controls.endsOn.disabled).toBe(true);
    expect(group.controls.endsAfter.disabled).toBe(true);
    expect(group.valid).toBe(true);

    group.controls.ends.setValue('ON');
    expect(group.controls.endsOn.enabled).toBe(true);
    expect(group.valid).toBe(false);

    group.controls.endsOn.setValue(new Date(2026, 11, 31));
    fixture.detectChanges();
    expect(group.valid).toBe(true);
    expect(schedule()).toContain('UNTIL=20261231T235959Z');

    group.controls.ends.setValue('AFTER');
    expect(group.controls.endsOn.disabled).toBe(true);
    fixture.detectChanges();
    expect(schedule()).toContain('COUNT=12');

    group.controls.ends.setValue('NEVER');
    fixture.detectChanges();
    expect(group.valid).toBe(true);
    expect(schedule()).not.toContain('COUNT');
    expect(schedule()).not.toContain('UNTIL');
  });

  it('keeps the rule panel out of anything but development', () => {
    fillSchedule();
    expect(fixture.nativeElement.querySelector('.schedule-form__rule')).not.toBeNull();

    // `showRepeatRule` defaults to `isDevMode()`; a host that wants it off — the
    // detail tab — passes `false` explicitly, which is what this reproduces.
    fixture.componentRef.setInput('showRepeatRule', false);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.schedule-form__rule')).toBeNull();
    // Only the read-back is gated; the form still composes the rule.
    expect(schedule()).toBe('DTSTART:20260905T090000Z\nRRULE:FREQ=WEEKLY;BYDAY=SA');
    expect(fixture.nativeElement.querySelectorAll('mat-timepicker-toggle').length).toBe(2);
  });

  it('takes the hours from timepickers, not a raw time input', () => {
    expect(fixture.nativeElement.querySelectorAll('input[type="time"]').length).toBe(0);
    expect(fixture.nativeElement.querySelectorAll('mat-timepicker-toggle').length).toBe(2);
  });

  it('rejects a closing time that is not after opening, on the control that shows it', () => {
    fillSchedule({ opensAt: parseTimeOfDay('15:00'), closesAt: parseTimeOfDay('09:00') });
    expect(group.hasError('tradingWindow')).toBe(true);
    // Group errors never reach a `mat-error`; the control-level one is what an
    // organiser actually sees under the field.
    expect(group.controls.closesAt.hasError('matTimepickerMin')).toBe(true);

    fillSchedule({ closesAt: parseTimeOfDay('16:00') });
    expect(group.hasError('tradingWindow')).toBe(false);
    expect(group.controls.closesAt.valid).toBe(true);
  });

  it('needs at least one trading day', () => {
    fillSchedule({ tradingDays: [] });
    expect(group.controls.tradingDays.hasError('required')).toBe(true);
    expect(schedule()).toBe('');
  });
});
