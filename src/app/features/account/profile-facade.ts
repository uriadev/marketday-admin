import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ProfileRepository } from '../../core/api/ports/profile-repository';
import { AdminProfile, AdminProfilePatch } from '../../core/models/admin-user.model';
import { LoadStatus } from '../../core/state/collection-store';

/**
 * The signed-in admin's own settings (design 1k). Provided at the `profile`
 * route, so the other settings pages never pay for a form they don't render.
 */
@Injectable()
export class ProfileFacade {
  private readonly repo = inject(ProfileRepository);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _profile = signal<AdminProfile | null>(null);
  private readonly _status = signal<LoadStatus>('idle');
  private readonly _error = signal<string | null>(null);
  private readonly _saving = signal(false);
  private readonly _saveError = signal<string | null>(null);

  readonly profile = this._profile.asReadonly();
  readonly isLoading = computed(() => this._status() === 'loading');
  readonly hasError = computed(() => this._status() === 'error');
  readonly error = this._error.asReadonly();
  readonly isSaving = this._saving.asReadonly();
  /** Why the last save was refused, or `null`. */
  readonly saveError = this._saveError.asReadonly();

  load(): void {
    this._status.set('loading');
    this._error.set(null);
    this.repo
      .profile()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (profile) => {
          this._profile.set(profile);
          this._status.set('ready');
        },
        error: (cause: unknown) => {
          this._error.set(
            cause instanceof Error ? cause.message : 'Your account could not be loaded.',
          );
          this._status.set('error');
        },
      });
  }

  /** `onSaved` runs only on success — the form uses it to mark itself pristine. */
  save(patch: AdminProfilePatch, onSaved: (profile: AdminProfile) => void): void {
    this._saving.set(true);
    this._saveError.set(null);
    this.repo
      .save(patch)
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

  sendPasswordReset(onSent: () => void, onFailed: (message: string) => void): void {
    this.repo
      .sendPasswordReset()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => onSent(),
        error: (cause: unknown) =>
          onFailed(cause instanceof Error ? cause.message : 'That link could not be sent.'),
      });
  }
}
