import { DestroyRef, Signal, WritableSignal, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';

/** Where a collection is in its load cycle. */
export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Loading, error, entity and filter state for a list screen, written once
 * (`../../../../docs/ARCHITECTURE.md` §4). Subclasses supply only {@link fetch}
 * and whatever selectors their screen needs — they never re-implement the
 * status machine.
 *
 * Filters are held here but deliberately do **not** trigger a reload: a fixture
 * backend hands back the whole collection and narrows it client-side, while a
 * server-side implementation will call `load()` after `setFilters()`. Each
 * subclass makes that choice explicit.
 */
export abstract class CollectionStore<T, F extends object = Record<string, never>> {
  private readonly destroyRef = inject(DestroyRef);

  private readonly _items = signal<readonly T[]>([]);
  private readonly _status = signal<LoadStatus>('idle');
  private readonly _error = signal<string | null>(null);
  private readonly _filters: WritableSignal<F>;

  readonly items: Signal<readonly T[]> = this._items.asReadonly();
  readonly status: Signal<LoadStatus> = this._status.asReadonly();
  readonly error: Signal<string | null> = this._error.asReadonly();
  readonly filters: Signal<F>;

  readonly isLoading = computed(() => this._status() === 'loading');
  readonly hasError = computed(() => this._status() === 'error');
  /** True only once a load has *succeeded* and returned nothing — not while loading. */
  readonly isEmpty = computed(() => this._status() === 'ready' && this._items().length === 0);

  protected constructor(private readonly initialFilters: F) {
    this._filters = signal(initialFilters);
    this.filters = this._filters.asReadonly();
  }

  /** The one call a subclass has to provide. */
  protected abstract fetch(filters: F): Observable<readonly T[]>;

  load(): void {
    this._status.set('loading');
    this._error.set(null);
    this.fetch(this._filters())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this._items.set(items);
          this._status.set('ready');
        },
        error: (cause: unknown) => {
          this._error.set(cause instanceof Error ? cause.message : 'Something went wrong.');
          this._status.set('error');
        },
      });
  }

  /**
   * Swaps the loaded items without a round trip — for a command whose response
   * already carries the updated entity, so a resolve or an approve does not
   * cost a re-fetch of the whole collection.
   */
  protected replaceAll(items: readonly T[]): void {
    this._items.set(items);
  }

  setFilters(patch: Partial<F>): void {
    this._filters.update((current) => ({ ...current, ...patch }));
  }

  resetFilters(): void {
    this._filters.set(this.initialFilters);
  }
}
