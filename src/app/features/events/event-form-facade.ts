import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, of } from 'rxjs';
import { catchError, finalize, switchMap } from 'rxjs/operators';
import { EventRepository } from '../../core/api/ports/event-repository';
import { EventDraft, EventForm, EventRecord } from '../../core/models/event.model';
import { PickerOption } from '../../core/models/picker-option.model';
import { LoadStatus } from '../../core/state/collection-store';

/**
 * The one event behind the event form, for both of its addresses. Provided by
 * the component, so it dies with the screen.
 *
 * `/events/new` and `/events/:id` are the same load — the markets an event
 * can be held at are needed either way — and `id === null` is the only
 * difference between the two calls.
 */
@Injectable()
export class EventFormFacade {
  private readonly repo = inject(EventRepository);
  private readonly destroyRef = inject(DestroyRef);

  private eventId: string | null = null;

  private readonly _form = signal<EventForm | null>(null);
  private readonly _status = signal<LoadStatus>('idle');
  private readonly _error = signal<string | null>(null);
  private readonly _saving = signal(false);
  private readonly _deleting = signal(false);
  private readonly _vendorOptions = signal<readonly PickerOption[]>([]);
  private readonly _searchingVendors = signal(false);
  private readonly vendorQueries = new Subject<string>();

  readonly form = this._form.asReadonly();
  readonly event = computed(() => this._form()?.event ?? null);
  readonly markets = computed(() => this._form()?.markets ?? []);
  readonly status = this._status.asReadonly();
  readonly error = this._error.asReadonly();
  readonly isLoading = computed(() => this._status() === 'loading');
  readonly hasError = computed(() => this._status() === 'error');
  readonly isSaving = this._saving.asReadonly();
  readonly isDeleting = this._deleting.asReadonly();
  readonly vendorOptions = this._vendorOptions.asReadonly();
  readonly searchingVendors = this._searchingVendors.asReadonly();

  constructor() {
    // The latest query wins; a slow answer to an older one is dropped.
    this.vendorQueries
      .pipe(
        switchMap((query) => {
          this._searchingVendors.set(true);
          return this.repo.searchVendors(query).pipe(
            catchError(() => of<readonly PickerOption[]>([])),
            finalize(() => this._searchingVendors.set(false)),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((options) => this._vendorOptions.set(options));
  }

  load(id: string | null): void {
    this.eventId = id;
    this._status.set('loading');
    this._error.set(null);
    this.repo
      .form(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (form) => {
          this._form.set(form);
          this._status.set('ready');
        },
        error: (cause: unknown) => {
          this._form.set(null);
          this._error.set(cause instanceof Error ? cause.message : 'That event could not be loaded.');
          this._status.set('error');
        },
      });
  }

  searchVendors(query: string): void {
    this.vendorQueries.next(query);
  }

  /**
   * Creates or updates, whichever address the form is on. `onDone` gets the
   * stored event, or `null` when the write was refused — the reason is in
   * {@link error}, in the backend's words.
   */
  save(draft: EventDraft, onDone: (saved: EventRecord | null) => void): void {
    if (this._saving()) return;
    this._saving.set(true);
    this._error.set(null);
    const id = this.eventId;
    const request = id === null ? this.repo.create(draft) : this.repo.update(id, draft);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (saved) => {
        this._saving.set(false);
        // The stored record is the new baseline — the snapped point, the
        // sorted sessions, the area a market event defaulted to.
        this._form.update((form) => (form ? { ...form, event: saved } : form));
        onDone(saved);
      },
      error: (cause: unknown) => {
        this._saving.set(false);
        this._error.set(
          cause instanceof Error ? cause.message : "Those changes didn't save. Try again.",
        );
        onDone(null);
      },
    });
  }

  /** `onDone(true)` only once the event is really gone. */
  remove(onDone: (removed: boolean) => void): void {
    const id = this.eventId;
    if (id === null || this._deleting()) return;
    this._deleting.set(true);
    this.repo
      .remove(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this._deleting.set(false);
          onDone(true);
        },
        error: (cause: unknown) => {
          this._deleting.set(false);
          this._error.set(
            cause instanceof Error ? cause.message : "That event wasn't deleted. Try again.",
          );
          onDone(false);
        },
      });
  }
}
