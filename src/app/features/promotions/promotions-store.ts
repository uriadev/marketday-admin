import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PromotionRepository } from '../../core/api/ports/promotion-repository';
import { PagedCollectionStore } from '../../core/state/paged-collection-store';
import { PageRequest } from '../../core/models/page.model';
import {
  EMPTY_PROMOTION_FACETS,
  EMPTY_PROMOTION_FILTERS,
  PromotionDirectoryFacets,
  PromotionDirectoryPage,
  PromotionFilters,
  PromotionRecord,
  PromotionStatus,
  hasPromotionFilters,
} from '../../core/models/promotion.model';

/**
 * Every promotion, one page at a time. Provided at the `/promotions` route.
 *
 * The header and the Status menu count every promotion, not the page, so
 * those are facets beside it. Status changes are not optimistic: the serving
 * state they lead to is the server's to derive (a resumed promotion whose
 * subject went hidden is not live), so the row is swapped for the stored one.
 */
@Injectable()
export class PromotionsStore extends PagedCollectionStore<PromotionRecord, PromotionFilters> {
  private readonly repo = inject(PromotionRepository);

  private readonly _facets = signal<PromotionDirectoryFacets>(EMPTY_PROMOTION_FACETS);
  private readonly _busy = signal(false);
  private readonly _commandError = signal<string | null>(null);

  readonly busy = this._busy.asReadonly();
  readonly commandError = this._commandError.asReadonly();

  constructor() {
    super(EMPTY_PROMOTION_FILTERS);
  }

  protected override fetchPage(
    filters: PromotionFilters,
    page: PageRequest,
  ): Observable<PromotionDirectoryPage> {
    return this.repo.list({ filters, page }).pipe(tap((result) => this._facets.set(result.facets)));
  }

  /* ── Selectors ─────────────────────────────────────────────────────────── */

  readonly promotionCount = computed(() => this._facets().promotionCount);

  /** "14 promotions". */
  readonly heading = computed(() => {
    const total = this.promotionCount();
    return `${total.toLocaleString('en-IE')} ${total === 1 ? 'promotion' : 'promotions'}`;
  });

  /** "9 scheduled · 2 paused · 3 drafts". */
  readonly summary = computed(() => {
    const { scheduled, paused, draft } = this._facets().statusCounts;
    const parts = [`${scheduled} scheduled`];
    if (paused > 0) parts.push(`${paused} paused`);
    if (draft > 0) parts.push(`${draft} ${draft === 1 ? 'draft' : 'drafts'}`);
    return `${parts.join(' · ')} — booked off the platform, reviewed by hand`;
  });

  statusCount(status: PromotionStatus): number {
    return this._facets().statusCounts[status];
  }

  readonly hasActiveFilters = computed(() => hasPromotionFilters(this.filters()));

  readonly isFilteredEmpty = computed(
    () => !this.isLoading() && this.total() === 0 && this.promotionCount() > 0,
  );

  readonly isWhollyEmpty = computed(
    () => this.status() === 'ready' && this.total() === 0 && this.promotionCount() === 0,
  );

  /* ── Commands ──────────────────────────────────────────────────────────── */

  setStatus(
    promotion: PromotionRecord,
    status: PromotionStatus,
    onDone: (saved: PromotionRecord | null) => void,
  ): void {
    if (this._busy()) return;
    this._busy.set(true);
    this._commandError.set(null);
    this.repo.setStatus(promotion.id, status).subscribe({
      next: (saved) => {
        this._busy.set(false);
        this.replaceAll(this.items().map((item) => (item.id === saved.id ? saved : item)));
        // The Status menu's counts moved, and the row may no longer match.
        this.load();
        onDone(saved);
      },
      error: (cause: unknown) => this.refuse(cause, onDone),
    });
  }

  remove(promotion: PromotionRecord, onDone: (removed: boolean) => void): void {
    if (this._busy()) return;
    this._busy.set(true);
    this._commandError.set(null);
    this.repo.remove(promotion.id).subscribe({
      next: () => {
        this._busy.set(false);
        this.load();
        onDone(true);
      },
      error: (cause: unknown) => this.refuse(cause, () => onDone(false)),
    });
  }

  private refuse(cause: unknown, onDone: (saved: null) => void): void {
    this._commandError.set(
      cause instanceof Error ? cause.message : 'That promotion could not be updated.',
    );
    this._busy.set(false);
    onDone(null);
  }
}
