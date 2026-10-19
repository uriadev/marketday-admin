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
  PROMOTION_PLACEMENTS,
  PROMOTION_PLACEMENT_LABELS,
  PROMOTION_SERVING_STATE_HINTS,
  PROMOTION_SERVING_STATE_LABELS,
  PROMOTION_STATUSES,
  PROMOTION_STATUS_LABELS,
  PROMOTION_TARGET_KINDS,
  PROMOTION_TARGET_KIND_LABELS,
  PromotionFilters,
  PromotionPlacement,
  PromotionRecord,
  PromotionServingState,
  PromotionStatus,
  PromotionTargetKind,
  SPONSOR_FILTER_LABELS,
  SponsorFilter,
} from '../../../core/models/promotion.model';
import { Notifications } from '../../../core/notifications/notifications';
import { marketDate } from '../../../core/time/market-time';
import { PromotionsStore } from '../promotions-store';

const SEARCH_DEBOUNCE_MS = 300;

const SERVING_TONES: Record<PromotionServingState, PillTone> = {
  live: 'positive',
  upcoming: 'muted',
  draft: 'muted',
  ended: 'muted',
  paused: 'warn',
  'subject-hidden': 'alert',
};

const SPONSOR_FILTERS = Object.keys(SPONSOR_FILTER_LABELS) as SponsorFilter[];

/**
 * Every promotion — booked off the platform, reviewed by hand, scheduled only
 * by an admin.
 *
 * The serving-state pill is the column that matters: it is derived by the
 * server from the status, the clock and the subject, so "Subject hidden" — a
 * booking whose vendor went inactive or whose event was unpublished — reads
 * as what it is rather than as an app bug. Scheduling, pausing and resuming
 * live in the row menu and act at once; the form never changes the status.
 */
@Component({
  selector: 'md-promotions',
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
  templateUrl: './promotions.html',
  styleUrl: './promotions.css',
})
export class Promotions {
  readonly q = input<string>();
  readonly placement = input<string>();
  readonly status = input<string>();
  readonly subject = input<string>();
  readonly sponsor = input<string>();

  protected readonly store = inject(PromotionsStore);
  protected readonly chrome = inject(ConsoleChrome);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly notifications = inject(Notifications);

  protected readonly placements = PROMOTION_PLACEMENTS;
  protected readonly placementLabels = PROMOTION_PLACEMENT_LABELS;
  protected readonly statuses = PROMOTION_STATUSES;
  protected readonly statusLabels = PROMOTION_STATUS_LABELS;
  protected readonly targetKinds = PROMOTION_TARGET_KINDS;
  protected readonly targetKindLabels = PROMOTION_TARGET_KIND_LABELS;
  protected readonly sponsorFilters = SPONSOR_FILTERS;
  protected readonly sponsorLabels = SPONSOR_FILTER_LABELS;
  protected readonly columns = [
    'creative',
    'subject',
    'placement',
    'period',
    'reach',
    'priority',
    'state',
    'actions',
  ];

  protected readonly filters = computed<PromotionFilters>(() => ({
    q: this.q() ?? '',
    placement: this.pick(this.placement(), PROMOTION_PLACEMENTS),
    status: this.pick(this.status(), PROMOTION_STATUSES),
    targetKind: this.pick(this.subject(), PROMOTION_TARGET_KINDS),
    sponsor: this.pick(this.sponsor(), SPONSOR_FILTERS) ?? 'any',
  }));

  private readonly typed = new Subject<string>();

  constructor() {
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
    this.setParam({ q: null, placement: null, status: null, subject: null, sponsor: null });
  }

  protected onSearch(event: Event): void {
    this.typed.next((event.target as HTMLInputElement).value);
  }

  protected setPlacement(placement: PromotionPlacement | null): void {
    this.setParam({ placement });
  }

  protected setStatus(status: PromotionStatus | null): void {
    this.setParam({ status });
  }

  protected setSubject(subject: PromotionTargetKind | null): void {
    this.setParam({ subject });
  }

  protected setSponsor(sponsor: SponsorFilter): void {
    this.setParam({ sponsor: sponsor === 'any' ? null : sponsor });
  }

  protected readonly placementLabel = computed(() => {
    const placement = this.filters().placement;
    return placement === null ? 'Placement' : PROMOTION_PLACEMENT_LABELS[placement];
  });

  protected readonly statusLabel = computed(() => {
    const status = this.filters().status;
    return status === null ? 'Status' : PROMOTION_STATUS_LABELS[status];
  });

  protected readonly subjectLabel = computed(() => {
    const kind = this.filters().targetKind;
    return kind === null ? 'Subject' : PROMOTION_TARGET_KIND_LABELS[kind];
  });

  protected onPage(event: PageEvent): void {
    this.store.setPage(event.pageIndex, event.pageSize);
  }

  /* ── Rows ──────────────────────────────────────────────────────────────── */

  protected kindName(promotion: PromotionRecord): string {
    return PROMOTION_TARGET_KIND_LABELS[promotion.subject.kind];
  }

  protected placementName(promotion: PromotionRecord): string {
    return PROMOTION_PLACEMENT_LABELS[promotion.placement];
  }

  protected period(promotion: PromotionRecord): string {
    return `${marketDate(promotion.startsAt)} – ${marketDate(promotion.endsAt)}`;
  }

  protected reach(promotion: PromotionRecord): string {
    if (promotion.isNationwide || !promotion.reach) return 'Nationwide';
    return `${promotion.reach.radiusKm} km radius`;
  }

  protected scope(promotion: PromotionRecord): string {
    const count = promotion.marketIds.length;
    return count === 0 ? '' : `${count} ${count === 1 ? 'market' : 'markets'} only`;
  }

  protected stateName(promotion: PromotionRecord): string {
    return PROMOTION_SERVING_STATE_LABELS[promotion.servingState];
  }

  protected stateHint(promotion: PromotionRecord): string {
    return PROMOTION_SERVING_STATE_HINTS[promotion.servingState];
  }

  protected stateTone(promotion: PromotionRecord): PillTone {
    return SERVING_TONES[promotion.servingState];
  }

  protected hasEnded(promotion: PromotionRecord): boolean {
    return promotion.endsAt.getTime() <= Date.now();
  }

  /* ── Commands ──────────────────────────────────────────────────────────── */

  /** Scheduling puts a paid card in front of buyers, so it asks first. */
  protected schedule(promotion: PromotionRecord): void {
    const data: ConfirmDialogData = {
      title: `Schedule ${promotion.displayHeadline}?`,
      body:
        `It serves in the ${PROMOTION_PLACEMENT_LABELS[promotion.placement].toLowerCase()} from ` +
        `${marketDate(promotion.startsAt)} to ${marketDate(promotion.endsAt)}, labelled ` +
        `"${promotion.disclosure}", for as long as its subject stays public. Check the creative ` +
        'before you do — scheduling is the review.',
      confirmLabel: 'Schedule',
    };
    this.dialog
      .open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, { data })
      .afterClosed()
      .subscribe((confirmed) => {
        if (confirmed) this.changeStatus(promotion, 'scheduled', 'is scheduled.');
      });
  }

  protected pause(promotion: PromotionRecord): void {
    this.changeStatus(promotion, 'paused', 'is paused. It stops serving straight away.');
  }

  protected resume(promotion: PromotionRecord): void {
    this.changeStatus(promotion, 'scheduled', 'is scheduled again.');
  }

  protected backToDraft(promotion: PromotionRecord): void {
    this.changeStatus(promotion, 'draft', 'is back to draft.');
  }

  private changeStatus(promotion: PromotionRecord, status: PromotionStatus, said: string): void {
    this.store.setStatus(promotion, status, (saved) => {
      if (saved) this.notifications.success(`${saved.displayHeadline} ${said}`);
    });
  }

  protected confirmDelete(promotion: PromotionRecord): void {
    const data: ConfirmDialogData = {
      title: `Delete ${promotion.displayHeadline}?`,
      body:
        'The booking is removed for good. To stop it serving for now — a complaint, a dispute — ' +
        'pause it instead.',
      confirmLabel: 'Delete promotion',
    };
    this.dialog
      .open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, { data })
      .afterClosed()
      .subscribe((confirmed) => {
        if (!confirmed) return;
        this.store.remove(promotion, (removed) => {
          if (removed) this.notifications.success(`${promotion.displayHeadline} is deleted.`);
        });
      });
  }

  private pick<T extends string>(value: string | undefined, allowed: readonly T[]): T | null {
    return allowed.includes(value as T) ? (value as T) : null;
  }
}
