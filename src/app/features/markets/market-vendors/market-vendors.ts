import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  ConfirmDialog,
  ConfirmDialogData,
} from '../../../shared/components/confirm-dialog/confirm-dialog';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import { FacePile } from '../../../shared/components/face-pile/face-pile';
import { StatusPill } from '../../../shared/components/status-pill/status-pill';
import { PillTone } from '../../../shared/components/status-pill/status-pill';
import {
  MARKET_VENDOR_TOGGLES,
  MarketVendor,
  MarketVendorFilters,
  MarketVendorToggle,
} from '../../../core/models/market.model';
import { VendorRepository } from '../../../core/api/ports/vendor-repository';
import { VendorSummary } from '../../../core/models/vendor.model';
import { Notifications } from '../../../core/notifications/notifications';
import { MarketDetailFacade } from '../market-detail-facade';
import { MarketVendorsStore } from '../market-vendors-store';
import { AddVendorDialog, AddVendorDialogData } from '../add-vendor-dialog/add-vendor-dialog';

/** A page you can take in without scrolling the table, as the directory does. */
const PAGE_SIZE = 25;

/**
 * The Vendors tab of a market (design 1g): who trades here, which pitch they
 * hold, whether the day's fee is in, and who is waiting on a decision.
 *
 * It is the vendor directory (design 1a) narrowed to one market, so it keeps
 * that screen's row anatomy and links every row back to the vendor's own
 * record rather than duplicating it.
 *
 * The one thing it writes is the roster itself — who trades here. **Add
 * existing vendor** puts a business already on MarketDay onto this market, and
 * a row's **Remove from this market** takes it off again; both go through
 * `VendorRepository`, which sends the `joinMarket` / `leaveMarket` pair that
 * grew an ADMIN branch for this screen. Assigning a pitch, pausing a
 * membership and reviewing an application still belong to screens that do not
 * exist yet, so those actions read as coming soon.
 */
@Component({
  selector: 'md-market-vendors',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    Avatar,
    EmptyState,
    FacePile,
    StatusPill,
    MatButtonModule,
    MatChipsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatTableModule,
    MatTooltipModule,
  ],
  templateUrl: './market-vendors.html',
  styleUrl: './market-vendors.css',
})
export class MarketVendors {
  /** Bound from the parent `:slug` route param by `withComponentInputBinding()`. */
  readonly slug = input.required<string>();

  /** Filters arrive as query params (§7); an absent one binds as `undefined`. */
  readonly q = input<string>();
  readonly feeUnpaid = input<string>();
  readonly paused = input<string>();
  readonly noStall = input<string>();

  protected readonly store = inject(MarketVendorsStore);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly vendors = inject(VendorRepository);
  private readonly notifications = inject(Notifications);
  /** Provided at the parent `:slug` route — the shell's load, for the tab badge. */
  private readonly detail = inject(MarketDetailFacade);

  protected readonly toggles = MARKET_VENDOR_TOGGLES;
  protected readonly columns = ['vendor', 'stall', 'fee', 'staff', 'status', 'actions'];

  protected readonly filters = computed<MarketVendorFilters>(() => ({
    q: this.q() ?? '',
    feeUnpaid: this.feeUnpaid() === 'true',
    paused: this.paused() === 'true',
    noStall: this.noStall() === 'true',
  }));

  /** Page position is view state, not something worth putting in a link. */
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = signal(PAGE_SIZE);

  protected readonly page = computed(() => {
    const start = this.pageIndex() * this.pageSize();
    return this.store.visible().slice(start, start + this.pageSize());
  });

  constructor() {
    effect(() => this.store.loadFor(this.slug()));
    // The URL is the source of truth; the store follows it.
    effect(() => this.store.setFilters(this.filters()));
    // A narrower list can be shorter than the page you were on.
    effect(() => {
      this.store.visible();
      this.pageIndex.set(0);
    });
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
    this.setParam({ q: null, feeUnpaid: null, paused: null, noStall: null });
  }

  protected onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.setParam({ q: value === '' ? null : value });
  }

  protected readonly activeToggles = computed(() =>
    MARKET_VENDOR_TOGGLES.filter((option) => this.filters()[option.value]).map((o) => o.value),
  );

  /**
   * The listbox reports the whole selection, so every toggle is written at
   * once. Binding each chip's `selected` *and* listening to its own
   * `selectionChange` would feed back on itself.
   */
  protected setToggles(selected: readonly MarketVendorToggle[] | null): void {
    const on = new Set(selected ?? []);
    this.setParam(
      Object.fromEntries(
        MARKET_VENDOR_TOGGLES.map((option) => [option.value, on.has(option.value) ? 'true' : null]),
      ),
    );
  }

  protected toggleCount(toggle: MarketVendorToggle): number {
    if (toggle === 'feeUnpaid') return this.store.feeUnpaidCount();
    if (toggle === 'paused') return this.store.pausedCount();
    return this.store.noStallCount();
  }

  protected onPage(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
  }

  /* ── Roster ────────────────────────────────────────────────────────────── */

  /** This market, named in the dialogs. The slug is the fallback pre-load. */
  private marketName(): string {
    return this.detail.market()?.name ?? this.slug();
  }

  protected addVendor(): void {
    const data: AddVendorDialogData = {
      marketName: this.marketName(),
      onRosterSlugs: this.store.items().map((vendor) => vendor.slug),
    };
    this.dialog
      .open<AddVendorDialog, AddVendorDialogData, VendorSummary>(AddVendorDialog, {
        data,
        width: '520px',
      })
      .afterClosed()
      .subscribe((vendor) => {
        if (!vendor) return;
        this.vendors.addToMarket(vendor.slug, this.slug()).subscribe({
          next: () => {
            this.refresh();
            this.notifications.success(`${vendor.name} now trades at ${this.marketName()}.`);
          },
          error: (cause: unknown) =>
            this.notifications.error(
              cause instanceof Error ? cause.message : `${vendor.name} could not be added.`,
            ),
        });
      });
  }

  protected removeVendor(vendor: MarketVendor): void {
    const data: ConfirmDialogData = {
      title: `Remove ${vendor.name} from ${this.marketName()}?`,
      body:
        `They stop trading here straight away. This market’s order lead time, any pause on ` +
        `the stall and the products they list here go with it — rejoining starts from the ` +
        `defaults. The vendor itself, its team and its other markets are untouched.`,
      confirmLabel: 'Remove from market',
      cancelLabel: 'Keep them',
    };
    this.dialog
      .open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, { data, width: '480px' })
      .afterClosed()
      .subscribe((confirmed) => {
        if (!confirmed) return;
        this.vendors.removeFromMarket(vendor.slug, this.slug()).subscribe({
          next: () => {
            this.refresh();
            this.notifications.success(`${vendor.name} no longer trades at ${this.marketName()}.`);
          },
          error: (cause: unknown) =>
            this.notifications.error(
              cause instanceof Error ? cause.message : `${vendor.name} could not be removed.`,
            ),
        });
      });
  }

  /**
   * Both reads the membership changed. The roster is this tab's own, and the
   * shell's `detail()` carries the count in the Vendors tab badge — without
   * the second call the badge keeps the number it was rendered with.
   */
  private refresh(): void {
    this.store.load();
    this.detail.load(this.slug());
  }

  /* ── Cells ─────────────────────────────────────────────────────────────── */

  protected standingTone(vendor: MarketVendor): PillTone {
    if (vendor.standing === 'trading') return 'positive';
    if (vendor.standing === 'fee-unpaid') return 'warn';
    return 'muted';
  }

  protected staffLabel(vendor: MarketVendor): string {
    return `${vendor.staff.length} staff`;
  }
}
