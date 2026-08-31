import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import { PillTone, StatusPill } from '../../../shared/components/status-pill/status-pill';
import {
  ACTIVITY_KINDS,
  ACTIVITY_KIND_LABELS,
  ActivityEvent,
  ActivityFilters,
  ActivityKind,
} from '../../../core/models/activity.model';
import { VendorActivityStore } from '../vendor-activity-store';

/**
 * The Activity tab of a vendor (design 2c): who changed what, in order.
 *
 * Every write to the vendor record lands here from either app — memberships,
 * staff and their scopes, fees, profile fields and documents. Sign-ins and page
 * views deliberately do not: an audit log people actually read is one that only
 * carries changes.
 */
@Component({
  selector: 'md-vendor-activity',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    Avatar,
    EmptyState,
    StatusPill,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatProgressBarModule,
    MatTooltipModule,
  ],
  templateUrl: './vendor-activity.html',
  styleUrl: './vendor-activity.css',
})
export class VendorActivity {
  /** Bound from the parent `:slug` route param by `withComponentInputBinding()`. */
  readonly slug = input.required<string>();

  /** Filters arrive as query params (§7); an absent one binds as `undefined`. */
  readonly kind = input<string>();
  readonly actor = input<string>();

  protected readonly store = inject(VendorActivityStore);
  private readonly router = inject(Router);

  protected readonly kinds = ACTIVITY_KINDS;
  protected readonly kindLabels = ACTIVITY_KIND_LABELS;

  protected readonly filters = computed<ActivityFilters>(() => ({
    kind: this.asKind(this.kind()),
    actor: this.actor() ?? null,
  }));

  protected readonly actorLabel = computed(() => this.filters().actor ?? 'Anyone');

  constructor() {
    effect(() => this.store.loadFor(this.slug()));
    // The URL is the source of truth, and a filter change restarts the feed.
    effect(() => this.store.applyFilters(this.filters()));
  }

  /* ── Filters ───────────────────────────────────────────────────────────── */

  protected setParam(patch: Record<string, string | null>): void {
    void this.router.navigate([], {
      queryParams: patch,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected setKind(kind: ActivityKind | null): void {
    this.setParam({ kind });
  }

  protected setActor(actor: string | null): void {
    this.setParam({ actor });
  }

  protected clearFilters(): void {
    this.setParam({ kind: null, actor: null });
  }

  /* ── Entries ───────────────────────────────────────────────────────────── */

  /** The platform acting on its own is not a face — it gets a mark instead. */
  protected isAutomatic(event: ActivityEvent): boolean {
    return event.source === 'automatic';
  }

  protected kindName(event: ActivityEvent): string {
    return ACTIVITY_KIND_LABELS[event.kind];
  }

  /** Money and memberships are the entries someone is answerable for. */
  protected kindTone(event: ActivityEvent): PillTone {
    if (event.kind === 'payment') return 'warn';
    return event.kind === 'membership' ? 'positive' : 'muted';
  }

  private asKind(value: string | undefined): ActivityKind | null {
    return ACTIVITY_KINDS.includes(value as ActivityKind) ? (value as ActivityKind) : null;
  }
}
