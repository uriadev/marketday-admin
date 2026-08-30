import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DestroyRef } from '@angular/core';
import { ActivityRepository } from '../../core/api/ports/activity-repository';
import { CollectionStore } from '../../core/state/collection-store';
import {
  ActivityDay,
  ActivityEvent,
  ActivityFilters,
  ActivitySummary,
  EMPTY_ACTIVITY_FILTERS,
} from '../../core/models/activity.model';

const EMPTY_SUMMARY: ActivitySummary = {
  changes: 0,
  byAdmins: 0,
  mostActive: [],
  actors: [],
};

/**
 * One vendor's audit log (design 2c). Provided at the `activity` route, so it
 * dies with the tab.
 *
 * Unlike the other stores, this one takes the **server-side** branch the base
 * class documents: an audit log is unbounded, so the chips and the actor menu
 * go to the repository and `applyFilters()` reloads from the top rather than
 * narrowing whatever happens to be in memory.
 */
@Injectable()
export class VendorActivityStore extends CollectionStore<ActivityEvent, ActivityFilters> {
  private readonly repo = inject(ActivityRepository);
  private readonly onDestroy = inject(DestroyRef);

  private readonly slug = signal('');
  private readonly _summary = signal<ActivitySummary>(EMPTY_SUMMARY);
  private readonly _hasMore = signal(false);
  /** Set while an older page is on its way, so the button can say so. */
  private readonly _loadingMore = signal(false);

  readonly summary = this._summary.asReadonly();
  readonly hasMore = this._hasMore.asReadonly();
  readonly loadingMore = this._loadingMore.asReadonly();

  constructor() {
    super(EMPTY_ACTIVITY_FILTERS);
  }

  protected override fetch(filters: ActivityFilters): Observable<readonly ActivityEvent[]> {
    return this.repo.feed(this.slug(), filters).pipe(
      tap((feed) => {
        this._summary.set(feed.summary);
        this._hasMore.set(feed.hasMore);
      }),
      map((feed) => feed.events),
    );
  }

  /** The tab knows the vendor; the store is told once and then reloads itself. */
  loadFor(slug: string): void {
    this.slug.set(slug);
    this.load();
  }

  /** A chip or the actor menu moved: the feed starts again from the top. */
  applyFilters(filters: ActivityFilters): void {
    this.setFilters(filters);
    this.load();
  }

  /**
   * "Load older activity" — the next page under the oldest entry on screen.
   * Keyed on `sortKey` rather than an offset, so entries written while an admin
   * reads cannot shift the page under them.
   */
  loadOlder(): void {
    const oldest = this.items()[this.items().length - 1];
    if (!oldest || this._loadingMore() || !this._hasMore()) return;

    this._loadingMore.set(true);
    this.repo
      .feed(this.slug(), this.filters(), oldest.sortKey)
      .pipe(takeUntilDestroyed(this.onDestroy))
      .subscribe({
        next: (feed) => {
          this.replaceAll([...this.items(), ...feed.events]);
          this._hasMore.set(feed.hasMore);
          this._loadingMore.set(false);
        },
        error: () => this._loadingMore.set(false),
      });
  }

  /* ── Selectors ─────────────────────────────────────────────────────────── */

  /**
   * The feed, grouped under its day headings. Grouping happens here rather than
   * in the template because a day can span two pages — "Load older" must extend
   * the last group, not start a second one with the same heading.
   */
  readonly days = computed<readonly ActivityDay[]>(() => {
    const days: ActivityDay[] = [];
    for (const event of this.items()) {
      const last = days[days.length - 1];
      if (last && last.label === event.day) {
        (last.events as ActivityEvent[]).push(event);
      } else {
        days.push({ label: event.day, events: [event] });
      }
    }
    return days;
  });

  readonly hasActiveFilters = computed(() => {
    const { kind, actor } = this.filters();
    return kind !== null || actor !== null;
  });

  /** True when a filter left the feed with nothing, rather than the log being new. */
  readonly isFilteredEmpty = computed(
    () => !this.isLoading() && this.items().length === 0 && this.hasActiveFilters(),
  );
}
