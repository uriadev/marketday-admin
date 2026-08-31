import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Notifications } from '../../core/notifications/notifications';
import { MarketDetailFacade } from './market-detail-facade';
import { MarketScheduleFacade } from './market-schedule-facade';
import {
  MarketScheduleForm,
  createScheduleForm,
  scheduleFields,
  seedScheduleForm,
} from './schedule-form';

/**
 * The Schedule tab of a market: the trading pattern the API turns into market
 * days. The same editor the add-market wizard's Schedule step uses, so a
 * pattern reads and edits identically whether it is being written for the first
 * time or corrected two seasons later.
 *
 * It changes the regular rule only. A single cancelled Saturday is a different
 * question — it belongs to the market calendar, and the sub-line says so rather
 * than leaving an organiser to look for it here.
 */
@Component({
  selector: 'md-market-schedule',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MarketScheduleForm, MatButtonModule, MatIconModule, MatProgressBarModule],
  templateUrl: './market-schedule.html',
  styleUrl: './market-schedule.css',
})
export class MarketSchedule {
  /** Bound from the parent `:slug` route param by `withComponentInputBinding()`. */
  readonly slug = input.required<string>();

  protected readonly facade = inject(MarketScheduleFacade);
  private readonly detail = inject(MarketDetailFacade);
  private readonly notifications = inject(Notifications);

  /**
   * Built here rather than by the child, so this component owns the value and
   * the child stays the presentational half. A field initialiser is an
   * injection context, which is what the factory's `takeUntilDestroyed()` needs.
   */
  protected readonly form = createScheduleForm();

  /** Only to raise the editor's errors — see `MarketScheduleForm.showErrors()`. */
  private readonly editor = viewChild(MarketScheduleForm);

  private readonly revision = signal(0);

  /**
   * Whether there is anything to save. Reactive forms are not signals, so a
   * template reading `form.pristine` directly would have nothing to re-render
   * on — every place that can change it bumps `revision` instead.
   */
  protected readonly dirty = computed(() => (this.revision(), !this.form.pristine));

  constructor() {
    this.form.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.revision.update((n) => n + 1));

    effect(() => this.facade.load(this.slug()));
    // A fresh load is the form's new baseline, so it starts pristine.
    effect(() => {
      if (this.facade.schedule()) this.reset();
    });
  }

  protected readonly busy = computed(() => this.facade.isLoading() || this.facade.isSaving());

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.editor()?.showErrors();
      this.notifications.error('Some fields still need attention.');
      return;
    }
    if (this.form.pristine) return;

    this.facade.save(scheduleFields(this.form.getRawValue()), () => {
      this.form.markAsPristine();
      this.revision.update((n) => n + 1);
      const name = this.detail.market()?.name;
      this.notifications.success(
        name ? `${name}’s trading pattern is saved.` : 'The trading pattern is saved.',
      );
    });
  }

  /** Drops every unsaved edit back to the loaded pattern. */
  protected reset(): void {
    const stored = this.facade.schedule();
    if (!stored) return;
    seedScheduleForm(this.form, stored);
    this.revision.update((n) => n + 1);
  }
}
