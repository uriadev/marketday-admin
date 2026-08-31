import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MarketRepository } from '../../core/api/ports/market-repository';
import { MarketSchedulePatch } from '../../core/models/market.model';
import { LoadStatus } from '../../core/state/collection-store';

/**
 * The editable trading pattern behind the manage screen's Schedule tab.
 * Provided at the `schedule` route rather than beside `MarketDetailFacade`, so
 * the other tabs never pay for a form they don't render.
 */
@Injectable()
export class MarketScheduleFacade {
  private readonly repo = inject(MarketRepository);
  private readonly destroyRef = inject(DestroyRef);

  private slug = '';
  private readonly _schedule = signal<MarketSchedulePatch | null>(null);
  private readonly _status = signal<LoadStatus>('idle');
  private readonly _error = signal<string | null>(null);
  private readonly _saving = signal(false);
  private readonly _saveError = signal<string | null>(null);

  readonly schedule = this._schedule.asReadonly();
  readonly status = this._status.asReadonly();
  readonly error = this._error.asReadonly();
  readonly isLoading = computed(() => this._status() === 'loading');
  readonly hasError = computed(() => this._status() === 'error');
  readonly isSaving = this._saving.asReadonly();
  /** Why the last save was refused, or `null`. Cleared when another starts. */
  readonly saveError = this._saveError.asReadonly();

  load(slug: string = this.slug): void {
    this.slug = slug;
    this._status.set('loading');
    this._error.set(null);
    this.repo
      .schedule(slug)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (schedule) => {
          this._schedule.set(schedule);
          this._status.set('ready');
        },
        error: (cause: unknown) => {
          this._schedule.set(null);
          this._error.set(
            cause instanceof Error ? cause.message : 'That schedule could not be loaded.',
          );
          this._status.set('error');
        },
      });
  }

  /**
   * Publishes the pattern. `onSaved` runs only on success — the form uses it to
   * mark itself pristine, which is the one thing the facade should not reach
   * into the component to do.
   */
  save(patch: MarketSchedulePatch, onSaved: (schedule: MarketSchedulePatch) => void): void {
    this._saving.set(true);
    this._saveError.set(null);
    this.repo
      .saveSchedule(this.slug, patch)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (schedule) => {
          this._schedule.set(schedule);
          this._saving.set(false);
          onSaved(schedule);
        },
        error: (cause: unknown) => {
          this._saveError.set(
            cause instanceof Error ? cause.message : 'Those changes could not be saved.',
          );
          this._saving.set(false);
        },
      });
  }
}
