import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MarketRepository } from '../../core/api/ports/market-repository';
import { MarketDetail } from '../../core/models/market.model';
import { LoadStatus } from '../../core/state/collection-store';

/**
 * Orchestrates {@link MarketRepository} for one market's management screens
 * (design 1g) and exposes the result as signals. Provided at the `:slug` route,
 * so the shell and every tab under it read the same load.
 */
@Injectable()
export class MarketDetailFacade {
  private readonly repo = inject(MarketRepository);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _market = signal<MarketDetail | null>(null);
  private readonly _status = signal<LoadStatus>('idle');
  private readonly _error = signal<string | null>(null);

  readonly market = this._market.asReadonly();
  readonly status = this._status.asReadonly();
  readonly error = this._error.asReadonly();
  readonly isLoading = computed(() => this._status() === 'loading');
  readonly hasError = computed(() => this._status() === 'error');

  load(slug: string): void {
    this._status.set('loading');
    this._error.set(null);
    this.repo
      .detail(slug)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (market) => {
          this._market.set(market);
          this._status.set('ready');
        },
        error: (cause: unknown) => {
          this._market.set(null);
          this._error.set(
            cause instanceof Error ? cause.message : 'That market could not be loaded.',
          );
          this._status.set('error');
        },
      });
  }
}
