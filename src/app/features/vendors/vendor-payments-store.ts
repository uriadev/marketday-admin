import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { PaymentRepository } from '../../core/api/ports/payment-repository';
import { CollectionStore } from '../../core/state/collection-store';
import {
  EMPTY_PAYMENT_FILTERS,
  FeeLine,
  PaymentFilters,
  PaymentMethod,
  StallPayment,
} from '../../core/models/payment.model';

/** How many rows back "Last 6 months" and "This year" reach into the ledger. */
const PERIOD_ROWS: Record<PaymentFilters['period'], number> = {
  sixMonths: 20,
  thisYear: 34,
  all: Number.POSITIVE_INFINITY,
};

/** One stat tile's worth of figures. */
export interface LedgerStat {
  label: string;
  value: string;
  suffix: string;
  hint: string;
  tone: 'neutral' | 'alert';
}

function euro(amount: number): string {
  const rounded = Math.round(Math.abs(amount));
  const grouped = rounded.toLocaleString('en-IE');
  return `${amount < 0 ? '−' : ''}€${grouped}`;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * A vendor's stall fees across every membership (design 2b). Provided at the
 * `payments` route, so it dies with the tab.
 *
 * The banner and all four tiles are **derived** from the ledger rather than
 * fetched beside it: "outstanding", "paid on time" and the rest are
 * restatements of the same rows, so marking one invoice paid moves the banner,
 * the tiles and the fee lines together and none of them can drift.
 */
@Injectable()
export class VendorPaymentsStore extends CollectionStore<StallPayment, PaymentFilters> {
  private readonly repo = inject(PaymentRepository);

  private readonly slug = signal('');
  private readonly _feeLines = signal<readonly FeeLine[]>([]);
  private readonly _method = signal<PaymentMethod | null>(null);
  private readonly _nextChargeOn = signal('');
  /** Set while a command is in flight, so the screen stops taking clicks. */
  private readonly _busy = signal(false);
  private readonly _commandError = signal<string | null>(null);

  readonly feeLines = this._feeLines.asReadonly();
  readonly method = this._method.asReadonly();
  readonly busy = this._busy.asReadonly();
  /** Why the last command was refused, or `null`. */
  readonly commandError = this._commandError.asReadonly();

  constructor() {
    super(EMPTY_PAYMENT_FILTERS);
  }

  protected override fetch(): Observable<readonly StallPayment[]> {
    return this.repo.ledger(this.slug()).pipe(
      tap((ledger) => {
        this._feeLines.set(ledger.feeLines);
        this._method.set(ledger.method);
        this._nextChargeOn.set(ledger.nextChargeOn);
      }),
      map((ledger) => ledger.payments),
    );
  }

  /** The tab knows the vendor; the store is told once and then reloads itself. */
  loadFor(slug: string): void {
    this.slug.set(slug);
    this.load();
  }

  /* ── Selectors ─────────────────────────────────────────────────────────── */

  /** Every market this vendor is billed at, for the chip row. */
  readonly markets = computed(() =>
    this.feeLines().map((line) => ({ slug: line.marketSlug, label: line.market })),
  );

  /** Invoices still open, newest first — what the banner and Waive act on. */
  readonly outstanding = computed(() => this.items().filter((payment) => payment.status === 'due'));

  /** Settled charges, which is what "paid this year" and "on time" count. */
  private readonly settled = computed(() =>
    this.items().filter((payment) => payment.status === 'paid'),
  );

  readonly outstandingTotal = computed(() =>
    this.outstanding().reduce((total, payment) => total + payment.amount, 0),
  );

  /** The worst lateness among open invoices — the banner leads with it. */
  private readonly worstLateDays = computed(() =>
    this.outstanding().reduce((worst, payment) => Math.max(worst, payment.lateDays), 0),
  );

  /** What the card run takes next: every market that isn't paused. */
  private readonly nextCharge = computed(() => {
    const billed = this.feeLines().filter((line) => !line.paused);
    return {
      amount: billed.reduce((total, line) => total + line.perDay, 0),
      markets: billed.length,
    };
  });

  readonly stats = computed<readonly LedgerStat[]>(() => {
    const settled = this.settled();
    const paid = settled.reduce((total, payment) => total + payment.amount, 0);
    const onTime = settled.filter((payment) => payment.lateDays === 0).length;
    const open = this.outstanding();
    const late = this.worstLateDays();
    const next = this.nextCharge();

    return [
      {
        label: 'Paid this year',
        value: euro(paid),
        suffix: '',
        hint: plural(settled.length, 'market day', 'market days'),
        tone: 'neutral',
      },
      {
        label: 'Outstanding',
        value: euro(this.outstandingTotal()),
        suffix: '',
        hint:
          open.length === 0
            ? 'Nothing owed'
            : `${plural(open.length, 'invoice', 'invoices')}${
                late > 0 ? `, ${plural(late, 'day', 'days')} late` : ''
              }`,
        tone: open.length > 0 ? 'alert' : 'neutral',
      },
      {
        label: 'Next charge',
        value: euro(next.amount),
        suffix: '',
        hint:
          next.markets === 0
            ? 'Nothing scheduled'
            : `${this._nextChargeOn()} · ${plural(next.markets, 'market', 'markets')}`,
        tone: 'neutral',
      },
      {
        label: 'Paid on time',
        value: `${onTime}`,
        suffix: `/${settled.length}`,
        hint: 'Since January',
        tone: 'neutral',
      },
    ];
  });

  /** The amber banner, or `null` when nothing is owed. */
  readonly alert = computed(() => {
    const open = this.outstanding();
    const first = open[0];
    if (!first) return null;

    const late = this.worstLateDays();
    const others = this.items().filter(
      (payment) => payment.marketSlug !== first.marketSlug && payment.status === 'due',
    );
    const headline =
      open.length === 1
        ? `${euro(first.amount)} outstanding · ${first.market}`
        : `${euro(this.outstandingTotal())} outstanding · ${plural(open.length, 'invoice', 'invoices')}`;

    return {
      payment: first,
      headline,
      body:
        late > 0
          ? `${plural(late, 'day', 'days')} late. ${
              others.length === 0
                ? 'Their other memberships are paid up, so trading is not blocked yet.'
                : 'More than one membership is behind.'
            }`
          : 'Not late yet — the charge is simply still open.',
    };
  });

  readonly hasActiveFilters = computed(() => {
    const { market, period } = this.filters();
    return market !== null || period !== EMPTY_PAYMENT_FILTERS.period;
  });

  /**
   * The rows the table pages through. The period narrows how far back the
   * ledger reaches, the market chip narrows which memberships it covers.
   */
  readonly visible = computed(() => {
    const { market, period } = this.filters();
    const withinPeriod = [...this.items()]
      .sort((a, b) => b.sortKey - a.sortKey)
      .slice(0, PERIOD_ROWS[period]);
    return market === null
      ? withinPeriod
      : withinPeriod.filter((payment) => payment.marketSlug === market);
  });

  readonly isFilteredEmpty = computed(
    () => !this.isLoading() && this.visible().length === 0 && this.items().length > 0,
  );

  /* ── Commands ──────────────────────────────────────────────────────────── */

  markPaid(payment: StallPayment): void {
    this.run(this.repo.markPaid(this.slug(), payment.id));
  }

  waive(payment: StallPayment, reason: string): void {
    this.run(this.repo.waive(this.slug(), payment.id, reason));
  }

  sendReminder(payment: StallPayment): void {
    this.run(this.repo.sendReminder(this.slug(), payment.id));
  }

  /**
   * Runs a command and swaps in the line it returns. Not optimistic, unlike the
   * products grid: money is the one place where showing a state the server has
   * not confirmed is worse than a moment's wait.
   */
  private run(command: Observable<StallPayment>): void {
    this._busy.set(true);
    this._commandError.set(null);
    command.subscribe({
      next: (updated) => {
        this.replaceAll(
          this.items().map((payment) => (payment.id === updated.id ? updated : payment)),
        );
        this.refreshFeeLines();
        this._busy.set(false);
      },
      error: (cause: unknown) => {
        this._commandError.set(
          cause instanceof Error ? cause.message : 'That invoice could not be updated.',
        );
        this._busy.set(false);
      },
    });
  }

  /** A market with nothing open is paid up, whatever its line said before. */
  private refreshFeeLines(): void {
    this._feeLines.update((lines) =>
      lines.map((line) => {
        if (line.paused) return line;
        const open = this.items().some(
          (payment) => payment.marketSlug === line.marketSlug && payment.status === 'due',
        );
        return open ? line : { ...line, state: 'Paid to 22 Aug', tone: 'positive' as const };
      }),
    );
  }
}
