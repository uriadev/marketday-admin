import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SupportRepository } from '../../core/api/ports/support-repository';
import { EnquiryThread } from '../../core/models/support.model';
import { LoadStatus } from '../../core/state/collection-store';
import { SupportStore } from './support-store';

/**
 * The open enquiry (design 1j). Provided beside {@link SupportStore} on the
 * support route, so the thread pane and the list it sits next to are the same
 * two objects for the life of the screen.
 *
 * Replying, resolving and assigning all go through here rather than the
 * component, because each of them changes the list as well as the thread — the
 * facade is what keeps the two in step without a re-fetch.
 */
@Injectable()
export class SupportThreadFacade {
  private readonly repo = inject(SupportRepository);
  private readonly store = inject(SupportStore);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _thread = signal<EnquiryThread | null>(null);
  private readonly _status = signal<LoadStatus>('idle');
  private readonly _error = signal<string | null>(null);
  private readonly _sending = signal(false);

  readonly thread = this._thread.asReadonly();
  readonly status = this._status.asReadonly();
  readonly error = this._error.asReadonly();
  readonly sending = this._sending.asReadonly();
  readonly isLoading = computed(() => this._status() === 'loading');
  readonly hasError = computed(() => this._status() === 'error');

  load(id: string): void {
    this._status.set('loading');
    this._error.set(null);
    this.repo
      .thread(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (thread) => {
          this._thread.set(thread);
          this._status.set('ready');
        },
        error: (cause: unknown) => {
          this._thread.set(null);
          this._error.set(
            cause instanceof Error ? cause.message : 'That enquiry could not be opened.',
          );
          this._status.set('error');
        },
      });
  }

  /** Appends a reply, or an internal note the person who wrote in never sees. */
  reply(body: string, internal: boolean): void {
    const thread = this._thread();
    if (!thread || this._sending()) return;

    this._sending.set(true);
    this.repo
      .reply(thread.id, body, internal)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (message) => {
          this._sending.set(false);
          this._thread.update((current) =>
            current ? { ...current, messages: [...current.messages, message] } : current,
          );
        },
        error: () => {
          this._sending.set(false);
          this._error.set("That didn't send. Try again.");
        },
      });
  }

  resolve(): void {
    const thread = this._thread();
    if (!thread) return;
    this.repo
      .resolve(thread.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((updated) => {
        this._thread.update((current) => (current ? { ...current, status: 'resolved' } : current));
        this.store.patch(updated);
      });
  }

  assign(assignee: string | null): void {
    const thread = this._thread();
    if (!thread) return;
    this.repo
      .assign(thread.id, assignee)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((updated) => {
        this._thread.update((current) => (current ? { ...current, assignee } : current));
        this.store.patch(updated);
      });
  }
}
