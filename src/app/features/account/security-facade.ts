import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PasskeyRepository } from '../../core/api/ports/passkey-repository';
import { PasskeyCancelledError } from '../../core/auth/webauthn';
import { Passkey } from '../../core/models/passkey.model';
import { LoadStatus } from '../../core/state/collection-store';

function messageOf(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

/**
 * The signed-in admin's passkeys. Provided at the `security` route, like
 * `ProfileFacade` at `profile`. Writes take `onFailed` (and, where the page has
 * something to do next, a success callback) rather than exposing error state:
 * the page reports them as toasts, and there is no form here to hold them.
 */
@Injectable()
export class SecurityFacade {
  private readonly repo = inject(PasskeyRepository);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _passkeys = signal<readonly Passkey[]>([]);
  private readonly _status = signal<LoadStatus>('idle');
  private readonly _error = signal<string | null>(null);
  private readonly _adding = signal(false);

  readonly passkeys = this._passkeys.asReadonly();
  readonly isLoading = computed(() => this._status() === 'loading');
  readonly isReady = computed(() => this._status() === 'ready');
  readonly hasError = computed(() => this._status() === 'error');
  readonly error = this._error.asReadonly();
  /** True from opening the browser's prompt until the backend has stored the passkey. */
  readonly isAdding = this._adding.asReadonly();

  load(): void {
    this._status.set('loading');
    this._error.set(null);
    this.repo
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (passkeys) => {
          this._passkeys.set(passkeys);
          this._status.set('ready');
        },
        error: (cause: unknown) => {
          this._error.set(messageOf(cause, 'Your passkeys could not be loaded.'));
          this._status.set('error');
        },
      });
  }

  /** A dismissed prompt calls neither callback — nothing happened. */
  add(onAdded: (passkey: Passkey) => void, onFailed: (message: string) => void): void {
    this._adding.set(true);
    this.repo
      .register()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (passkey) => {
          this._passkeys.update((list) => [...list, passkey]);
          this._adding.set(false);
          onAdded(passkey);
        },
        error: (cause: unknown) => {
          this._adding.set(false);
          if (cause instanceof PasskeyCancelledError) return;
          onFailed(messageOf(cause, 'That passkey could not be added.'));
        },
      });
  }

  rename(id: string, name: string, onFailed: (message: string) => void): void {
    this.repo
      .rename(id, name)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (renamed) =>
          this._passkeys.update((list) => list.map((p) => (p.id === renamed.id ? renamed : p))),
        error: (cause: unknown) => onFailed(messageOf(cause, 'That passkey could not be renamed.')),
      });
  }

  remove(id: string, onRemoved: () => void, onFailed: (message: string) => void): void {
    this.repo
      .remove(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this._passkeys.update((list) => list.filter((p) => p.id !== id));
          onRemoved();
        },
        error: (cause: unknown) => onFailed(messageOf(cause, 'That passkey could not be removed.')),
      });
  }
}
