import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MarketRepository } from '../../core/api/ports/market-repository';
import { MarketSettingsPatch } from '../../core/models/market.model';
import { LoadStatus } from '../../core/state/collection-store';

/**
 * Everything about a market except its trading pattern — the manage screen's
 * Settings tab. Provided at the `settings` route rather than beside
 * `MarketDetailFacade`, so the other tabs never pay for a form they don't render.
 */
@Injectable()
export class MarketSettingsFacade {
  private readonly repo = inject(MarketRepository);
  private readonly destroyRef = inject(DestroyRef);

  private slug = '';
  private readonly _settings = signal<MarketSettingsPatch | null>(null);
  private readonly _status = signal<LoadStatus>('idle');
  private readonly _error = signal<string | null>(null);
  private readonly _saving = signal(false);
  private readonly _saveError = signal<string | null>(null);

  readonly settings = this._settings.asReadonly();
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
      .settings(slug)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (settings) => {
          this._settings.set(settings);
          this._status.set('ready');
        },
        error: (cause: unknown) => {
          this._settings.set(null);
          this._error.set(
            cause instanceof Error ? cause.message : 'Those settings could not be loaded.',
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
  save(patch: MarketSettingsPatch, onSaved: (settings: MarketSettingsPatch) => void): void {
    this._saving.set(true);
    this._saveError.set(null);
    this.repo
      .saveSettings(this.slug, patch)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (settings) => {
          this._settings.set(settings);
          this._saving.set(false);
          onSaved(settings);
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
