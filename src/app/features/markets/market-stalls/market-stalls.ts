import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { CdkDrag, CdkDragDrop, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { StallPitch } from '../../../core/models/market.model';
import { Notifications } from '../../../core/notifications/notifications';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import { MarketDetailFacade } from '../market-detail-facade';
import { MarketStallsStore } from '../market-stalls-store';

/** A drop list is either one pitch, by id, or the queue of vendors without one. */
type DropTarget = string | null;

/**
 * The Stalls tab: the pitch layout for a market, and who stands on each pitch.
 *
 * Two ways to move somebody, deliberately. Dragging is how a stall map is read
 * and rearranged when you can see the whole thing at once, and it is what the
 * Overview's map has always promised. Every drag also exists as a menu on the
 * pitch, because a drag is unreachable by keyboard or screen reader — these are
 * not a shortcut and a fallback, they are the same operation offered twice.
 */
@Component({
  selector: 'md-market-stalls',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CdkDrag,
    CdkDropList,
    CdkDropListGroup,
    Avatar,
    EmptyState,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatProgressBarModule,
    MatTooltipModule,
  ],
  templateUrl: './market-stalls.html',
  styleUrl: './market-stalls.css',
})
export class MarketStalls {
  /** Bound from the parent `:slug` route param by `withComponentInputBinding()`. */
  readonly slug = input.required<string>();

  protected readonly store = inject(MarketStallsStore);
  private readonly detail = inject(MarketDetailFacade);
  private readonly notifications = inject(Notifications);

  constructor() {
    effect(() => this.store.loadFor(this.slug()));
  }

  protected readonly busy = computed(() => this.store.isLoading() || this.store.isSaving());

  /** "Sat 22 August" — the market day this layout is for. */
  protected readonly marketDay = computed(() => this.detail.market()?.marketDayLabel ?? '');

  protected readonly summary = computed(() => {
    const filled = this.store.filled();
    const total = this.store.pitches().length;
    const waiting = this.store.unassigned().length;
    const pitches = `${filled} of ${total} ${total === 1 ? 'pitch' : 'pitches'} assigned`;
    return waiting === 0
      ? `${pitches}. Everyone trading has somewhere to stand.`
      : `${pitches}. ${waiting} ${waiting === 1 ? 'vendor is' : 'vendors are'} still waiting.`;
  });

  /* ── Dragging ──────────────────────────────────────────────────────────── */

  /** Where a drop list stands for: `null` is the queue, anything else a pitch. */
  protected readonly queue: DropTarget = null;

  /** A pitch as a drop target, widened so both lists agree on one type. */
  protected target(pitch: StallPitch): DropTarget {
    return pitch.id;
  }

  /**
   * A drop reads only what was dragged and where it landed — the store works
   * out where the vendor came from, so dragging out of the queue, off another
   * pitch, or back to the queue are all the same call.
   */
  protected drop(event: CdkDragDrop<DropTarget>): void {
    const vendorSlug = event.item.data as string;
    const pitchId = event.container.data;
    if (pitchId === null) this.store.unassign(vendorSlug);
    else this.store.assign(vendorSlug, pitchId);
  }

  /* ── Labels ────────────────────────────────────────────────────────────── */

  protected pitchLabel(pitch: StallPitch): string {
    const vendor = this.store.vendorAt(pitch);
    return vendor ? `Pitch ${pitch.id}, ${vendor.name}` : `Pitch ${pitch.id}, free`;
  }

  protected otherPitches(pitch: StallPitch): readonly StallPitch[] {
    return this.store.pitches().filter((candidate) => candidate.id !== pitch.id);
  }

  protected pitchOption(pitch: StallPitch): string {
    const vendor = this.store.vendorAt(pitch);
    return vendor ? `${pitch.id} — swap with ${vendor.name}` : `${pitch.id} — free`;
  }

  /* ── Saving ────────────────────────────────────────────────────────────── */

  protected save(): void {
    if (!this.store.isDirty()) return;
    this.store.save(() => {
      this.notifications.success(`The stall map for ${this.marketDay()} is saved.`);
      // The Overview draws its map and its "Stalls filled" tile from this plan.
      this.detail.load(this.slug());
    });
  }
}
