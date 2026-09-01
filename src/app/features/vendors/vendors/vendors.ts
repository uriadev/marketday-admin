import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ConsoleChrome } from '../../../layouts/console-layout/console-chrome';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusPill } from '../../../shared/components/status-pill/status-pill';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { FacePile } from '../../../shared/components/face-pile/face-pile';
import {
  VENDOR_TOGGLES,
  VendorFilters,
  VendorSummary,
  VendorToggle,
} from '../../../core/models/vendor.model';
import { VendorsStore } from '../vendors-store';

/** How many market chips a row shows before collapsing the rest into "+N". */
const MARKET_CHIP_LIMIT = 3;

@Component({
  selector: 'md-vendors',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    PageHeader,
    StatusPill,
    EmptyState,
    Avatar,
    FacePile,
    MatButtonModule,
    MatChipsModule,
    MatIconModule,
    MatMenuModule,
    MatFormFieldModule,
    MatInputModule,
    MatPaginatorModule,
    MatTableModule,
    MatTooltipModule,
    MatProgressBarModule,
  ],
  templateUrl: './vendors.html',
  styleUrl: './vendors.css',
})
export class Vendors implements OnInit {
  protected readonly store = inject(VendorsStore);
  protected readonly chrome = inject(ConsoleChrome);
  private readonly router = inject(Router);

  /** Filters arrive as query params (§7); an absent one binds as `undefined`. */
  readonly q = input<string>();
  readonly market = input<string>();
  readonly applications = input<string>();
  readonly multiMarket = input<string>();
  readonly feeUnpaid = input<string>();
  readonly paused = input<string>();

  protected readonly toggles = VENDOR_TOGGLES;
  protected readonly columns = ['vendor', 'markets', 'staff', 'status', 'actions'];

  protected readonly filters = computed<VendorFilters>(() => ({
    q: this.q() ?? '',
    market: this.market() ?? null,
    applications: this.applications() === 'true',
    multiMarket: this.multiMarket() === 'true',
    feeUnpaid: this.feeUnpaid() === 'true',
    paused: this.paused() === 'true',
  }));

  /** Page position is view state, not something worth putting in a link. */
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = signal(25);

  protected readonly heading = computed(() => {
    const total = this.store.items().length;
    return `${total} ${total === 1 ? 'vendor' : 'vendors'}`;
  });

  /** The slice of `visible()` the table renders. */
  protected readonly page = computed(() => {
    const start = this.pageIndex() * this.pageSize();
    return this.store.visible().slice(start, start + this.pageSize());
  });

  constructor() {
    // The URL is the source of truth; the store follows it.
    effect(() => this.store.setFilters(this.filters()));
    // A narrower list can be shorter than the page you were on.
    effect(() => {
      this.store.visible();
      this.pageIndex.set(0);
    });
  }

  ngOnInit(): void {
    this.store.load();
  }

  protected setParam(patch: Record<string, string | null>): void {
    void this.router.navigate([], {
      queryParams: patch,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected clearFilters(): void {
    this.setParam({
      q: null,
      market: null,
      applications: null,
      multiMarket: null,
      feeUnpaid: null,
      paused: null,
    });
  }

  protected onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.setParam({ q: value === '' ? null : value });
  }

  protected readonly activeToggles = computed(() =>
    VENDOR_TOGGLES.filter((option) => this.filters()[option.value]).map((o) => o.value),
  );

  protected isOn(toggle: VendorToggle): boolean {
    return this.filters()[toggle];
  }

  /**
   * The listbox reports the whole selection, so every toggle is written at
   * once. Binding each chip's `selected` *and* listening to its own
   * `selectionChange` would feed back on itself.
   */
  protected setToggles(selected: readonly VendorToggle[] | null): void {
    const on = new Set(selected ?? []);
    this.setParam(
      Object.fromEntries(
        VENDOR_TOGGLES.map((option) => [option.value, on.has(option.value) ? 'true' : null]),
      ),
    );
  }

  /** The "Applications" chip carries its own count, the others don't. */
  protected toggleCount(toggle: VendorToggle): number | null {
    return toggle === 'applications' ? this.store.applicationCount() : null;
  }

  protected onPage(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
  }

  protected marketChips(vendor: VendorSummary): readonly string[] {
    return vendor.markets.slice(0, MARKET_CHIP_LIMIT);
  }

  protected marketOverflow(vendor: VendorSummary): number {
    return Math.max(0, vendor.markets.length - MARKET_CHIP_LIMIT);
  }

  protected standingTone(vendor: VendorSummary): 'positive' | 'warn' | 'muted' {
    if (vendor.standing === 'trading') return 'positive';
    if (vendor.standing === 'fee-unpaid' || vendor.standing === 'invited') return 'warn';
    return 'muted';
  }

  protected staffLabel(vendor: VendorSummary): string {
    return `${vendor.staffCount} staff`;
  }
}
