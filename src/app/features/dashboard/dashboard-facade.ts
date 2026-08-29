import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DashboardRepository } from '../../core/api/ports/dashboard-repository';
import { OverviewSnapshot } from '../../core/models/overview.model';

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Orchestrates {@link DashboardRepository} for the Overview screen and exposes
 * the result as signals. Provided at the route, so it is created and torn down
 * with the screen.
 */
@Injectable()
export class DashboardFacade {
  private readonly repo = inject(DashboardRepository);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _snapshot = signal<OverviewSnapshot | null>(null);
  private readonly _status = signal<LoadStatus>('idle');

  readonly snapshot = this._snapshot.asReadonly();
  readonly status = this._status.asReadonly();
  readonly isLoading = computed(() => this._status() === 'loading');
  readonly hasError = computed(() => this._status() === 'error');

  load(): void {
    this._status.set('loading');
    this.repo
      .overview()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (snapshot) => {
          this._snapshot.set(snapshot);
          this._status.set('ready');
        },
        error: () => this._status.set('error'),
      });
  }
}
