import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { EventRepository } from '../../core/api/ports/event-repository';
import { PagedCollectionStore } from '../../core/state/paged-collection-store';
import { PageRequest } from '../../core/models/page.model';
import {
  EMPTY_EVENT_FACETS,
  EMPTY_EVENT_FILTERS,
  EventDirectoryFacets,
  EventDirectoryPage,
  EventFilters,
  EventRecord,
  hasEventFilters,
} from '../../core/models/event.model';

/**
 * Every event on the platform, one page at a time. Provided at the `/events`
 * route, so it dies with the screen.
 *
 * The header counts every event rather than the page, so those numbers are the
 * facets the repository hands back beside it. Commands are not optimistic:
 * each answers with the stored event, and the page is read again afterwards,
 * since a published or deleted row may no longer match the filters.
 */
@Injectable()
export class EventsStore extends PagedCollectionStore<EventRecord, EventFilters> {
  private readonly repo = inject(EventRepository);

  private readonly _facets = signal<EventDirectoryFacets>(EMPTY_EVENT_FACETS);
  private readonly _busy = signal(false);
  private readonly _commandError = signal<string | null>(null);

  readonly busy = this._busy.asReadonly();
  /** Why the last publish, feature or delete was refused, or `null`. */
  readonly commandError = this._commandError.asReadonly();

  constructor() {
    super(EMPTY_EVENT_FILTERS);
  }

  protected override fetchPage(
    filters: EventFilters,
    page: PageRequest,
  ): Observable<EventDirectoryPage> {
    return this.repo.list({ filters, page }).pipe(tap((result) => this._facets.set(result.facets)));
  }

  /* ── Selectors ─────────────────────────────────────────────────────────── */

  readonly eventCount = computed(() => this._facets().eventCount);

  /** "12 upcoming events". */
  readonly heading = computed(() => {
    const current = this._facets().currentCount;
    return `${current.toLocaleString('en-IE')} upcoming ${current === 1 ? 'event' : 'events'}`;
  });

  /** "48 in all · 3 drafts". */
  readonly summary = computed(() => {
    const { eventCount, draftCount } = this._facets();
    const parts = [`${eventCount.toLocaleString('en-IE')} in all`];
    if (draftCount > 0) parts.push(`${draftCount} ${draftCount === 1 ? 'draft' : 'drafts'}`);
    return parts.join(' · ');
  });

  readonly hasActiveFilters = computed(() => hasEventFilters(this.filters()));

  /** Nothing matched, but there are events — the state that offers a way out. */
  readonly isFilteredEmpty = computed(
    () => !this.isLoading() && this.total() === 0 && this.eventCount() > 0,
  );

  /** No events at all — the state that offers the first one. */
  readonly isWhollyEmpty = computed(
    () => this.status() === 'ready' && this.total() === 0 && this.eventCount() === 0,
  );

  /* ── Commands ──────────────────────────────────────────────────────────── */

  publish(event: EventRecord, published: boolean, onDone: (ok: boolean) => void): void {
    this.run(this.repo.setStatus(event.id, published ? 'published' : 'draft'), onDone);
  }

  feature(event: EventRecord, featured: boolean, onDone: (ok: boolean) => void): void {
    this.run(this.repo.setFeatured(event.id, featured), onDone);
  }

  remove(event: EventRecord, onDone: (ok: boolean) => void): void {
    this.run(this.repo.remove(event.id), onDone);
  }

  private run(command: Observable<unknown>, onDone: (ok: boolean) => void): void {
    if (this._busy()) return;
    this._busy.set(true);
    this._commandError.set(null);
    command.subscribe({
      next: () => {
        this._busy.set(false);
        this.load();
        onDone(true);
      },
      error: (cause: unknown) => {
        this._commandError.set(
          cause instanceof Error ? cause.message : 'That event could not be updated.',
        );
        this._busy.set(false);
        onDone(false);
      },
    });
  }
}
