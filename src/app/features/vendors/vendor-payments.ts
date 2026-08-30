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
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { EmptyState } from '../../shared/components/empty-state/empty-state';
import { StatTile } from '../../shared/components/stat-tile/stat-tile';
import { StatusPill } from '../../shared/components/status-pill/status-pill';
import { PillTone } from '../../shared/components/status-pill/status-pill';
import {
  LEDGER_PERIODS,
  LedgerPeriod,
  PaymentFilters,
  StallPayment,
} from '../../core/models/payment.model';
import { Notifications } from '../../core/notifications/notifications';
import { VendorDetailFacade } from './vendor-detail-facade';
import { VendorPaymentsStore } from './vendor-payments-store';
import { WaiveFeeDialog, WaiveFeeDialogData } from './waive-fee-dialog';

/** The design's ledger page — a screen's worth without scrolling the table. */
const PAGE_SIZE = 10;

/**
 * The Payments tab of a vendor (design 2b): every stall fee across every
 * membership, in one ledger.
 *
 * One ledger rather than one per market, because the question an admin arrives
 * with is "are they paid up", not "are they paid up here" — and because a
 * vendor late at one market while paid up at two others is a different
 * conversation from one who is behind everywhere. The banner says which.
 */
@Component({
  selector: 'md-vendor-payments',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    EmptyState,
    StatTile,
    StatusPill,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatTableModule,
    MatTooltipModule,
  ],
  templateUrl: './vendor-payments.html',
  styleUrl: './vendor-payments.css',
})
export class VendorPayments {
  /** Bound from the parent `:slug` route param by `withComponentInputBinding()`. */
  readonly slug = input.required<string>();

  /** Filters arrive as query params (§7); an absent one binds as `undefined`. */
  readonly market = input<string>();
  readonly period = input<string>();

  protected readonly store = inject(VendorPaymentsStore);
  protected readonly vendorFacade = inject(VendorDetailFacade);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly notifications = inject(Notifications);

  protected readonly periods = LEDGER_PERIODS;
  protected readonly columns = ['date', 'market', 'amount', 'status', 'actions'];

  protected readonly filters = computed<PaymentFilters>(() => ({
    market: this.market() ?? null,
    period: this.asPeriod(this.period()),
  }));

  /** Page position is view state, not something worth putting in a link. */
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = signal(PAGE_SIZE);

  protected readonly page = computed(() => {
    const start = this.pageIndex() * this.pageSize();
    return this.store.visible().slice(start, start + this.pageSize());
  });

  protected readonly periodLabel = computed(
    () =>
      LEDGER_PERIODS.find((option) => option.value === this.filters().period)?.label ??
      'Last 6 months',
  );

  constructor() {
    effect(() => this.store.loadFor(this.slug()));
    // The URL is the source of truth; the store follows it.
    effect(() => this.store.setFilters(this.filters()));
    // A narrower ledger can be shorter than the page you were on.
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

  protected setMarket(slug: string | null): void {
    this.setParam({ market: slug });
  }

  protected setPeriod(period: LedgerPeriod): void {
    this.setParam({ period: period === 'sixMonths' ? null : period });
  }

  protected clearFilters(): void {
    this.setParam({ market: null, period: null });
  }

  protected onPage(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
  }

  /* ── Rows ──────────────────────────────────────────────────────────────── */

  /** "€35", "−€35", "€0" — a refund reads as money going back out. */
  protected amountOf(payment: StallPayment): string {
    const rounded = Math.round(Math.abs(payment.amount));
    return `${payment.amount < 0 ? '−' : ''}€${rounded.toLocaleString('en-IE')}`;
  }

  protected statusTone(payment: StallPayment): PillTone {
    if (payment.status === 'paid') return 'positive';
    if (payment.status === 'due') return 'warn';
    return 'muted';
  }

  /** "Due · 2 days late", "Refunded", "Waived", "Paid". */
  protected statusLabel(payment: StallPayment): string {
    if (payment.status === 'due') {
      return payment.lateDays > 0
        ? `Due · ${payment.lateDays} ${payment.lateDays === 1 ? 'day' : 'days'} late`
        : 'Due';
    }
    if (payment.status === 'paid' && payment.lateDays > 0) {
      return `Paid · ${payment.lateDays} ${payment.lateDays === 1 ? 'day' : 'days'} late`;
    }
    return payment.status === 'refunded'
      ? 'Refunded'
      : payment.status === 'waived'
        ? 'Waived'
        : 'Paid';
  }

  protected isOpen(payment: StallPayment): boolean {
    return payment.status === 'due';
  }

  /* ── Commands ──────────────────────────────────────────────────────────── */

  protected markPaid(payment: StallPayment): void {
    this.store.markPaid(payment);
    this.notifications.success(`${this.amountOf(payment)} recorded as paid at ${payment.market}.`);
  }

  protected sendReminder(payment: StallPayment): void {
    this.store.sendReminder(payment);
    this.notifications.info(`Reminder sent for ${payment.market} · ${payment.period}.`);
  }

  /** The reason is required, so the waiver goes through a dialog either way. */
  protected waive(payment: StallPayment): void {
    const data: WaiveFeeDialogData = {
      payment,
      vendorName: this.vendorFacade.vendor()?.name ?? 'this vendor',
    };
    this.dialog
      .open<WaiveFeeDialog, WaiveFeeDialogData, string>(WaiveFeeDialog, { data, width: '480px' })
      .afterClosed()
      .subscribe((reason) => {
        if (!reason) return;
        this.store.waive(payment, reason);
        this.notifications.success(`The ${payment.market} fee is waived.`);
      });
  }

  private asPeriod(value: string | undefined): LedgerPeriod {
    return LEDGER_PERIODS.some((option) => option.value === value)
      ? (value as LedgerPeriod)
      : 'sixMonths';
  }
}
