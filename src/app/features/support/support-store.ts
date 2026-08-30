import { Injectable, computed, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { SupportRepository } from '../../core/api/ports/support-repository';
import { CollectionStore } from '../../core/state/collection-store';
import {
  EMPTY_SUPPORT_FILTERS,
  EnquirySummary,
  SupportFilters,
  isOverdue,
} from '../../core/models/support.model';

/** The assignee filter's stand-in for "nobody has picked this up". */
export const UNASSIGNED = 'unassigned';

/**
 * The support queue (design 1j). Provided at the route, so it dies with the
 * screen — and so the thread pane, which is a child route, injects the same
 * instance.
 *
 * One inbox whatever the enquiry came in through: the source is a tag and a
 * filter, never a separate list.
 */
@Injectable()
export class SupportStore extends CollectionStore<EnquirySummary, SupportFilters> {
  private readonly repo = inject(SupportRepository);

  constructor() {
    super(EMPTY_SUPPORT_FILTERS);
  }

  protected override fetch(): Observable<readonly EnquirySummary[]> {
    return this.repo.inbox();
  }

  readonly openCount = computed(
    () => this.items().filter((enquiry) => enquiry.status === 'open').length,
  );

  readonly overdueCount = computed(() => this.items().filter(isOverdue).length);

  /** Everyone with something assigned to them, for the assignee filter. */
  readonly assignees = computed(() =>
    [
      ...new Set(
        this.items()
          .map((enquiry) => enquiry.assignee)
          .filter((name): name is string => name !== null),
      ),
    ].sort((a, b) => a.localeCompare(b)),
  );

  readonly hasActiveFilters = computed(() => {
    const { q, source, status, assignee } = this.filters();
    return q.trim() !== '' || source !== null || status !== 'open' || assignee !== null;
  });

  /** The list, oldest-arrived last — an inbox reads top-down by arrival. */
  readonly visible = computed(() => {
    const { q, source, status, assignee } = this.filters();
    const needle = q.trim().toLowerCase();

    const matches = this.items().filter((enquiry) => {
      if (status !== 'all' && enquiry.status !== status) return false;
      if (source !== null && enquiry.source !== source) return false;
      if (assignee !== null && !matchesAssignee(enquiry, assignee)) return false;
      if (needle === '') return true;
      return (
        enquiry.who.toLowerCase().includes(needle) ||
        enquiry.subject.toLowerCase().includes(needle) ||
        enquiry.snippet.toLowerCase().includes(needle)
      );
    });

    return [...matches].sort((a, b) => a.ageHours - b.ageHours);
  });

  readonly isFilteredEmpty = computed(
    () => !this.isLoading() && this.visible().length === 0 && this.items().length > 0,
  );

  /** Replaces one row in place, so resolving does not re-fetch the whole queue. */
  patch(updated: EnquirySummary): void {
    this.replaceAll(this.items().map((row) => (row.id === updated.id ? updated : row)));
  }
}

/** "Unassigned" is a real choice in the menu, not the absence of one. */
function matchesAssignee(enquiry: EnquirySummary, assignee: string): boolean {
  return assignee === UNASSIGNED ? enquiry.assignee === null : enquiry.assignee === assignee;
}
