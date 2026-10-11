import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { VendorRepository } from '../../core/api/ports/vendor-repository';
import { VendorDetail, VendorKind } from '../../core/models/vendor.model';
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

  private readonly _changingKind = signal(false);
  /** A kind change is in flight — the menu item stays disabled until it lands. */
  readonly changingKind = this._changingKind.asReadonly();

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

  /**
   * Makes the loaded vendor a food truck or a stall holder, then reloads the
   * detail so the badges and stop count follow. `onDone` gets the error
   * message, or `null` once it has landed — a refusal (a truck that still
   * hosts stops) is something to tell the admin, not a broken page.
   */
  setKind(kind: VendorKind, onDone: (error: string | null) => void): void {
    const vendor = this._vendor();
    if (!vendor || this._changingKind()) return;
    this._changingKind.set(true);
    this.repo
      .setKind(vendor.slug, kind)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this._changingKind.set(false);
          this.load(vendor.slug);
          onDone(null);
        },
        error: (cause: unknown) => {
          this._changingKind.set(false);
          onDone(cause instanceof Error ? cause.message : 'That vendor could not be changed.');
        },
      });
  }
}
