import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ConsoleChrome } from '../../../layouts/console-layout/console-chrome';
import {
  ConfirmDialog,
  ConfirmDialogData,
} from '../../../shared/components/confirm-dialog/confirm-dialog';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { PillTone, StatusPill } from '../../../shared/components/status-pill/status-pill';
import {
  EVENT_CATEGORIES,
  EVENT_CATEGORY_LABELS,
  EVENT_STATUSES,
  EVENT_STATUS_LABELS,
  EVENT_VENUE_KINDS,
  EVENT_VENUE_KIND_ICONS,
  EVENT_VENUE_KIND_LABELS,
  EVENT_WHENS,
  EVENT_WHEN_LABELS,
  EventCategory,
  EventFilters,
  EventRecord,
  EventStatus,
  EventVenueKind,
  EventWhen,
} from '../../../core/models/event.model';
import { Notifications } from '../../../core/notifications/notifications';
import { marketRange } from '../../../core/time/market-time';
import { EventsStore } from '../events-store';

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Every event — a band at a market, a farm open day, a town festival — in one
 * table, upcoming and ongoing first.
 *
 * Only admins author events, so this is where they all start. Publishing,
 * featuring and deleting live in the row menu; the form is for everything
 * else. "Promote this event" hands over to the promotion form with the event
 * already picked: an event is content, a promotion is distribution, and one
 * never implies the other.
 */
@Component({
  selector: 'md-events',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    EmptyState,
    PageHeader,
    StatusPill,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatTableModule,
    MatTooltipModule,
  ],
  templateUrl: './events.html',
  styleUrl: './events.css',
})
export class Events {
  /** Filters arrive as query params (§7); an absent one binds as `undefined`. */
  readonly q = input<string>();
  readonly when = input<string>();
  readonly status = input<string>();
  readonly venue = input<string>();
  readonly category = input<string>();

  protected readonly store = inject(EventsStore);
  protected readonly chrome = inject(ConsoleChrome);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly notifications = inject(Notifications);

  protected readonly whens = EVENT_WHENS;
  protected readonly whenLabels = EVENT_WHEN_LABELS;
  protected readonly statuses = EVENT_STATUSES;
  protected readonly statusLabels = EVENT_STATUS_LABELS;
  protected readonly venueKinds = EVENT_VENUE_KINDS;
  protected readonly venueKindLabels = EVENT_VENUE_KIND_LABELS;
  protected readonly venueKindIcons = EVENT_VENUE_KIND_ICONS;
  protected readonly categories = EVENT_CATEGORIES;
  protected readonly categoryLabels = EVENT_CATEGORY_LABELS;
  protected readonly columns = ['event', 'venue', 'when', 'status', 'actions'];

  protected readonly filters = computed<EventFilters>(() => ({
    q: this.q() ?? '',
    when: this.pick(this.when(), EVENT_WHENS) ?? 'current',
    status: this.pick(this.status(), EVENT_STATUSES),
    venueKind: this.pick(this.venue(), EVENT_VENUE_KINDS),
    category: this.pick(this.category(), EVENT_CATEGORIES),
  }));

  private readonly typed = new Subject<string>();

  constructor() {
    // The URL is the source of truth; the store follows it.
    effect(() => this.store.setFilters(this.filters()));
    this.typed
      .pipe(debounceTime(SEARCH_DEBOUNCE_MS), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((value) => this.setParam({ q: value === '' ? null : value }));
  }

  /* ── Filters ───────────────────────────────────────────────────────────── */

  protected setParam(patch: Record<string, string | null>): void {
    void this.router.navigate([], {
      queryParams: patch,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected clearFilters(): void {
    this.setParam({ q: null, when: null, status: null, venue: null, category: null });
  }

  protected onSearch(event: Event): void {
    this.typed.next((event.target as HTMLInputElement).value);
  }

  protected setWhen(when: EventWhen): void {
    this.setParam({ when: when === 'current' ? null : when });
  }

  protected setStatus(status: EventStatus | null): void {
    this.setParam({ status });
  }

  protected setVenue(venue: EventVenueKind | null): void {
    this.setParam({ venue });
  }

  protected setCategory(category: EventCategory | null): void {
    this.setParam({ category });
  }

  protected readonly statusLabel = computed(() => {
    const status = this.filters().status;
    return status === null ? 'Status' : EVENT_STATUS_LABELS[status];
  });

  protected readonly venueLabel = computed(() => {
    const venue = this.filters().venueKind;
    return venue === null ? 'Venue' : EVENT_VENUE_KIND_LABELS[venue];
  });

  protected readonly categoryLabel = computed(() => {
    const category = this.filters().category;
    return category === null ? 'Category' : EVENT_CATEGORY_LABELS[category];
  });

  protected onPage(event: PageEvent): void {
    this.store.setPage(event.pageIndex, event.pageSize);
  }

  /* ── Rows ──────────────────────────────────────────────────────────────── */

  protected categoryName(event: EventRecord): string {
    return EVENT_CATEGORY_LABELS[event.category];
  }

  protected venueIcon(event: EventRecord): string {
    return EVENT_VENUE_KIND_ICONS[event.venue.kind];
  }

  protected whenText(event: EventRecord): string {
    return marketRange(event.startsAt, event.endsAt);
  }

  protected sessionCount(event: EventRecord): string {
    const count = event.sessions.length;
    return count === 1 ? '' : `${count} sessions`;
  }

  protected statusName(event: EventRecord): string {
    if (event.timing === 'ended') return 'Ended';
    if (event.status === 'draft') return 'Draft';
    return event.timing === 'ongoing' ? 'On now' : 'Published';
  }

  protected statusTone(event: EventRecord): PillTone {
    if (event.timing === 'ended') return 'muted';
    return event.status === 'draft' ? 'warn' : 'positive';
  }

  /* ── Commands ──────────────────────────────────────────────────────────── */

  protected togglePublished(event: EventRecord): void {
    const publishing = event.status === 'draft';
    this.store.publish(event, publishing, (ok) => {
      if (ok) {
        this.notifications.success(
          publishing ? `${event.title} is published.` : `${event.title} is back to draft.`,
        );
      }
    });
  }

  protected toggleFeatured(event: EventRecord): void {
    const featuring = !event.isFeatured;
    this.store.feature(event, featuring, (ok) => {
      if (ok) {
        this.notifications.success(
          featuring ? `${event.title} is featured.` : `${event.title} is no longer featured.`,
        );
      }
    });
  }

  protected confirmDelete(event: EventRecord): void {
    const data: ConfirmDialogData = {
      title: `Delete ${event.title}?`,
      body:
        'The event and its sessions are removed for good, and any promotion of it is deleted ' +
        'with it. To take it out of the app for now, move it back to draft instead.',
      confirmLabel: 'Delete event',
    };
    this.dialog
      .open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, { data })
      .afterClosed()
      .subscribe((confirmed) => {
        if (!confirmed) return;
        this.store.remove(event, (ok) => {
          if (ok) this.notifications.success(`${event.title} is deleted.`);
        });
      });
  }

  /* ── Query-param parsing ───────────────────────────────────────────────── */

  private pick<T extends string>(value: string | undefined, allowed: readonly T[]): T | null {
    return allowed.includes(value as T) ? (value as T) : null;
  }
}
