import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { MarketRepository } from '../../core/api/ports/market-repository';
import {
  MarketRoster,
  MarketStallPlan,
  MarketVendor,
  StallPitch,
} from '../../core/models/market.model';
import { LoadStatus } from '../../core/state/collection-store';

/** One row of the map, in the order the grid draws it. */
export interface StallRow {
  readonly row: string;
  readonly pitches: readonly StallPitch[];
}

/** Rows are lettered, so a market can grow to twenty-six of them. */
const ROW_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** The number half of a pitch reference — "B12" → 12. */
function numberOf(pitch: StallPitch): number {
  return Number(pitch.id.slice(pitch.row.length)) || 0;
}

/** Row first, then number, which is the order a market is walked in. */
function sortPlan(plan: readonly StallPitch[]): StallPitch[] {
  return [...plan].sort((a, b) => a.row.localeCompare(b.row) || numberOf(a) - numberOf(b));
}

/** A plan's identity as one string, for telling an edited plan from a saved one. */
function planKey(plan: MarketStallPlan): string {
  return plan.map((pitch) => `${pitch.id}:${pitch.vendorSlug ?? ''}`).join('|');
}

/**
 * The Stalls tab's working copy of a market's pitch layout.
 *
 * Every edit is made here and nowhere else, against a draft the tab holds until
 * it is saved — laying out a market is a handful of moves that only make sense
 * together, and an organiser who drags somebody onto the wrong pitch should be
 * able to walk away rather than have to undo it.
 *
 * Placement is by vendor slug throughout, and a vendor is on at most one pitch
 * by construction: every move rewrites the whole plan rather than editing a
 * pitch in isolation, so there is no state in which somebody stands twice.
 */
@Injectable()
export class MarketStallsStore {
  private readonly repo = inject(MarketRepository);
  private readonly destroyRef = inject(DestroyRef);

  private slug = '';
  /** The plan as the server last confirmed it — what Discard goes back to. */
  private readonly _saved = signal<MarketStallPlan>([]);
  private readonly _draft = signal<MarketStallPlan>([]);
  private readonly _roster = signal<MarketRoster | null>(null);
  private readonly _status = signal<LoadStatus>('idle');
  private readonly _error = signal<string | null>(null);
  private readonly _saving = signal(false);
  private readonly _saveError = signal<string | null>(null);

  readonly pitches = this._draft.asReadonly();
  readonly status = this._status.asReadonly();
  readonly error = this._error.asReadonly();
  readonly isLoading = computed(() => this._status() === 'loading');
  readonly hasError = computed(() => this._status() === 'error');
  readonly isSaving = this._saving.asReadonly();
  readonly saveError = this._saveError.asReadonly();

  readonly isDirty = computed(() => planKey(this._draft()) !== planKey(this._saved()));

  readonly rows = computed<readonly StallRow[]>(() => {
    const groups = new Map<string, StallPitch[]>();
    for (const pitch of this._draft()) {
      const row = groups.get(pitch.row);
      if (row) row.push(pitch);
      else groups.set(pitch.row, [pitch]);
    }
    return [...groups.entries()]
      .map(([row, pitches]) => ({ row, pitches }))
      .sort((a, b) => a.row.localeCompare(b.row));
  });

  /** Everyone who could stand somewhere — a paused member is not trading. */
  private readonly members = computed(() =>
    (this._roster()?.vendors ?? []).filter((vendor) => vendor.standing !== 'paused'),
  );

  private readonly bySlug = computed(
    () => new Map(this.members().map((vendor) => [vendor.slug, vendor] as const)),
  );

  /** Members with no pitch yet, in the roster's own order. */
  readonly unassigned = computed(() => {
    const placed = new Set(this._draft().map((pitch) => pitch.vendorSlug));
    return this.members().filter((vendor) => !placed.has(vendor.slug));
  });

  readonly filled = computed(() => this._draft().filter((pitch) => pitch.vendorSlug).length);
  readonly isEmpty = computed(() => this._status() === 'ready' && this._draft().length === 0);

  /** The vendor standing on a pitch, or `null` while it is free. */
  vendorAt(pitch: StallPitch): MarketVendor | null {
    return pitch.vendorSlug ? (this.bySlug().get(pitch.vendorSlug) ?? null) : null;
  }

  /* ── Loading ───────────────────────────────────────────────────────────── */

  loadFor(slug: string = this.slug): void {
    this.slug = slug;
    this._status.set('loading');
    this._error.set(null);
    forkJoin({ plan: this.repo.stallPlan(slug), roster: this.repo.roster(slug) })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ plan, roster }) => {
          this._roster.set(roster);
          this.accept(plan);
          this._status.set('ready');
        },
        error: (cause: unknown) => {
          this._roster.set(null);
          this._saved.set([]);
          this._draft.set([]);
          this._error.set(
            cause instanceof Error ? cause.message : 'That stall map could not be loaded.',
          );
          this._status.set('error');
        },
      });
  }

  /* ── Placement ─────────────────────────────────────────────────────────── */

  /**
   * Puts a vendor on a pitch. Whoever was standing there takes the vendor's own
   * pitch in exchange, or goes back to the queue if the vendor came from it —
   * so a drop is always a swap, and never quietly drops somebody from the map.
   */
  assign(vendorSlug: string, pitchId: string): void {
    this._draft.update((plan) => {
      const from = plan.find((pitch) => pitch.vendorSlug === vendorSlug)?.id ?? null;
      if (from === pitchId) return plan;
      const displaced = plan.find((pitch) => pitch.id === pitchId)?.vendorSlug ?? null;
      return plan.map((pitch) => {
        if (pitch.id === pitchId) return { ...pitch, vendorSlug };
        if (pitch.id === from) return { ...pitch, vendorSlug: displaced };
        return pitch;
      });
    });
  }

  /** Sends a vendor back to the queue, leaving their pitch free. */
  unassign(vendorSlug: string): void {
    this._draft.update((plan) =>
      plan.map((pitch) =>
        pitch.vendorSlug === vendorSlug ? { ...pitch, vendorSlug: null } : pitch,
      ),
    );
  }

  /** Frees one pitch, whoever is on it. */
  clear(pitchId: string): void {
    this._draft.update((plan) =>
      plan.map((pitch) => (pitch.id === pitchId ? { ...pitch, vendorSlug: null } : pitch)),
    );
  }

  /* ── Layout ────────────────────────────────────────────────────────────── */

  /**
   * Adds a pitch to a row, taking the lowest free number in it. Numbers are not
   * closed up when a pitch is removed: the reference is painted on the ground,
   * so A4 stays A4 even once A3 is gone.
   */
  addPitch(row: string): void {
    this._draft.update((plan) => {
      const taken = new Set(plan.filter((pitch) => pitch.row === row).map(numberOf));
      let next = 1;
      while (taken.has(next)) next += 1;
      return sortPlan([...plan, { id: `${row}${next}`, row, vendorSlug: null }]);
    });
  }

  /** Starts the next lettered row, with one pitch in it. */
  addRow(): void {
    const used = new Set(this._draft().map((pitch) => pitch.row));
    const row = [...ROW_LETTERS].find((letter) => !used.has(letter));
    if (row) this.addPitch(row);
  }

  /** Takes a pitch off the map. Anyone on it goes back to the queue. */
  removePitch(pitchId: string): void {
    this._draft.update((plan) => plan.filter((pitch) => pitch.id !== pitchId));
  }

  readonly canAddRow = computed(() => new Set(this._draft().map((p) => p.row)).size < 26);

  /* ── Saving ────────────────────────────────────────────────────────────── */

  /** Drops every unsaved move back to the last saved plan. */
  reset(): void {
    this._draft.set(this._saved());
  }

  save(onSaved: () => void): void {
    this._saving.set(true);
    this._saveError.set(null);
    this.repo
      .saveStallPlan(this.slug, this._draft())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (plan) => {
          this.accept(plan);
          this._saving.set(false);
          onSaved();
        },
        error: (cause: unknown) => {
          this._saveError.set(
            cause instanceof Error ? cause.message : 'That stall map could not be saved.',
          );
          this._saving.set(false);
        },
      });
  }

  /** A plan from the server is both the new draft and the new baseline. */
  private accept(plan: MarketStallPlan): void {
    const ordered = sortPlan(plan);
    this._saved.set(ordered);
    this._draft.set(ordered);
  }
}
