import { Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { Signal, WritableSignal, computed, signal, untracked } from '@angular/core';
import { DEFAULT_PAGE_SIZE, Page, PageRequest } from '../models/page.model';
import { CollectionStore } from './collection-store';

/**
 * A {@link CollectionStore} whose rows come one page at a time
 * (`../../../../docs/ARCHITECTURE.md` §4).
 *
 * The difference that matters is where narrowing happens. `CollectionStore`
 * holds the whole collection and its subclasses filter it client-side; here
 * `items()` is *one page*, so a filter applied above this class would narrow
 * the rows on screen instead of the directory behind them. Filters therefore
 * belong to the request: {@link setFilters} and {@link setPage} both go back to
 * the repository, and {@link total} — the count the paginator needs — comes
 * from the answer rather than from `items().length`.
 *
 * A filter change resets to the first page: page 4 of a narrower list is
 * usually past its end, and "no vendors match" would be the wrong reason for
 * an empty table.
 */
export abstract class PagedCollectionStore<
  T,
  F extends object = Record<string, never>,
> extends CollectionStore<T, F> {
  private readonly _pageIndex = signal(0);
  private readonly _pageSize: WritableSignal<number>;
  private readonly _total = signal(0);

  readonly pageIndex: Signal<number> = this._pageIndex.asReadonly();
  readonly pageSize: Signal<number>;
  /** Rows behind the current filters, across every page. */
  readonly total: Signal<number> = this._total.asReadonly();

  /**
   * Nothing matched. Counted rather than measured: an empty `items()` here
   * means "this page has no rows", which is also what page 9 of an 8-page list
   * looks like, and what every page looks like mid-flight.
   */
  override readonly isEmpty = computed(() => this.status() === 'ready' && this._total() === 0);

  protected constructor(initialFilters: F, pageSize: number = DEFAULT_PAGE_SIZE) {
    super(initialFilters);
    this._pageSize = signal(pageSize);
    this.pageSize = this._pageSize.asReadonly();
  }

  /** The one call a subclass provides: one page of rows, and the total behind it. */
  protected abstract fetchPage(filters: F, page: PageRequest): Observable<Page<T>>;

  /**
   * Untracked for the same reason `load()` reads its filters untracked — the
   * load can be triggered from a component effect, and the page it asks for
   * must not become a dependency of it.
   */
  protected override fetch(filters: F): Observable<readonly T[]> {
    const page = untracked(() => ({ index: this._pageIndex(), size: this._pageSize() }));
    return this.fetchPage(filters, page).pipe(
      tap((result) => this._total.set(result.total)),
      map((result) => result.items),
    );
  }

  /**
   * What the paginator emits. `MatPaginator` has already renumbered `index`
   * when the size changed, so both are taken as given; an event that moves
   * neither is dropped rather than costing a round trip.
   */
  setPage(index: number, size: number): void {
    if (index === this._pageIndex() && size === this._pageSize()) return;
    this._pageIndex.set(index);
    this._pageSize.set(size);
    this.load();
  }

  override setFilters(patch: Partial<F>): void {
    super.setFilters(patch);
    this.firstPage();
  }

  override resetFilters(): void {
    super.resetFilters();
    this.firstPage();
  }

  private firstPage(): void {
    this._pageIndex.set(0);
    this.load();
  }
}
