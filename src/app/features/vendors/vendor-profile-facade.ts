import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { VendorRepository } from '../../core/api/ports/vendor-repository';
import { VendorProfile, VendorProfilePatch } from '../../core/models/vendor.model';
import { LoadStatus } from '../../core/state/collection-store';

/**
 * The editable vendor record behind design 2a. Provided at the `profile` route
 * rather than beside `VendorDetailFacade`, so the other tabs never pay for a
 * form they don't render.
 */
@Injectable()
export class VendorProfileFacade {
  private readonly repo = inject(VendorRepository);
  private readonly destroyRef = inject(DestroyRef);

  private slug = '';
  private readonly _profile = signal<VendorProfile | null>(null);
  private readonly _status = signal<LoadStatus>('idle');
  private readonly _error = signal<string | null>(null);
  private readonly _saving = signal(false);
  private readonly _saveError = signal<string | null>(null);

  readonly profile = this._profile.asReadonly();
  readonly status = this._status.asReadonly();
  readonly error = this._error.asReadonly();
  readonly isLoading = computed(() => this._status() === 'loading');
  readonly hasError = computed(() => this._status() === 'error');
  readonly isSaving = this._saving.asReadonly();
  /** Why the last save was refused, or `null`. Cleared when another starts. */
  readonly saveError = this._saveError.asReadonly();

  load(slug: string): void {
    this.slug = slug;
    this._status.set('loading');
    this._error.set(null);
    this.repo
      .profile(slug)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (profile) => {
          this._profile.set(profile);
          this._status.set('ready');
        },
        error: (cause: unknown) => {
          this._profile.set(null);
          this._error.set(
            cause instanceof Error ? cause.message : 'That vendor could not be loaded.',
          );
          this._status.set('error');
        },
      });
  }

  /**
   * Publishes the record. `onSaved` runs only on success — the form uses it to
   * mark itself pristine, which is the one thing the facade should not reach
   * into the component to do.
   */
  save(patch: VendorProfilePatch, onSaved: (profile: VendorProfile) => void): void {
    this._saving.set(true);
    this._saveError.set(null);
    this.repo
      .saveProfile(this.slug, patch)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (profile) => {
          this._profile.set(profile);
          this._saving.set(false);
          onSaved(profile);
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
