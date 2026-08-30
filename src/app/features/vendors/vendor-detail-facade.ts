import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { VendorRepository } from '../../core/api/ports/vendor-repository';
import { VendorDetail } from '../../core/models/vendor.model';
import { LoadStatus } from '../../core/state/collection-store';

/**
 * Orchestrates {@link VendorRepository} for one vendor's tabs (design 1b) and
 * exposes the result as signals. Provided at the `:slug` route, so the shell
 * and every tab under it read the same load.
 */
@Injectable()
export class VendorDetailFacade {
  private readonly repo = inject(VendorRepository);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _vendor = signal<VendorDetail | null>(null);
  private readonly _status = signal<LoadStatus>('idle');
  private readonly _error = signal<string | null>(null);

  readonly vendor = this._vendor.asReadonly();
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
        next: (vendor) => {
          this._vendor.set(vendor);
          this._status.set('ready');
        },
        error: (cause: unknown) => {
          this._vendor.set(null);
          this._error.set(
            cause instanceof Error ? cause.message : 'That vendor could not be loaded.',
          );
          this._status.set('error');
        },
      });
  }
}
