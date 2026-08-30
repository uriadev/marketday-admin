import { Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { delay } from 'rxjs/operators';
import { FeeLine, StallPayment, VendorLedger } from '../../models/payment.model';
import { VendorMembership, VendorSummary } from '../../models/vendor.model';
import { PaymentRepository } from '../ports/payment-repository';
import { MARKET_LABELS, MCNALLY_DETAIL, VENDORS_FIXTURE } from './in-memory-vendor-repository';

/** Stall fee per market day, in euro — the figure the market screens use. */
const STALL_FEE = 35;

/** "Saturdays 09:00–14:30 · Stall A7 · member since…" → "stall A7". */
function stallOf(membership: VendorMembership): string {
  const stall = membership.detail.split(' · ').find((part) => part.startsWith('Stall'));
  return stall ? stall.toLowerCase() : 'no stall';
}

/**
 * The fee terms per membership. A paused membership is charged nothing, which
 * is why its state line says so rather than showing €0 due.
 */
function feeLinesFor(memberships: readonly VendorMembership[]): FeeLine[] {
  return memberships.map((membership) => {
    const due = membership.facts.find((fact) => fact.emphasis);
    if (membership.paused) {
      return {
        marketSlug: membership.marketSlug,
        market: membership.market,
        terms: `€${STALL_FEE} per day · monthly, transfer`,
        perDay: STALL_FEE,
        paused: true,
        state: 'Nothing due while paused',
        tone: 'muted' as const,
      };
    }
    return {
      marketSlug: membership.marketSlug,
      market: membership.market,
      terms: `€${STALL_FEE} per day · weekly, card`,
      perDay: STALL_FEE,
      paused: false,
      state: due ? `€${STALL_FEE} due since 20 Aug` : 'Paid to 22 Aug',
      tone: due ? ('alert' as const) : ('positive' as const),
    };
  });
}

type Seed = Omit<StallPayment, 'id' | 'sortKey'>;

/**
 * McNally's ledger, most recent first. The seven rows design 2b draws are
 * written out; the rest of the year is generated behind them so the paginator
 * and the year-to-date tallies have something real to count.
 *
 * Design 2b names a market McNally doesn't belong to on the Markets tab; as on
 * the Products tab, the ledger is built from the memberships instead, so the
 * paused line is Howth rather than a market that is nowhere else in the app.
 */
function mcnallySeeds(memberships: readonly VendorMembership[]): Seed[] {
  const [templeBar, marlayPark, paused] = memberships;
  const card = 'Card ···· 4417';

  const designed: Seed[] = [
    {
      date: '20 Aug 2026',
      marketSlug: marlayPark!.marketSlug,
      market: marlayPark!.market,
      period: `Sat 22 Aug · ${stallOf(marlayPark!)}`,
      method: card,
      reference: 'attempt failed',
      amount: STALL_FEE,
      status: 'due',
      lateDays: 2,
    },
    {
      date: '18 Aug 2026',
      marketSlug: templeBar!.marketSlug,
      market: templeBar!.market,
      period: `Sat 22 Aug · ${stallOf(templeBar!)}`,
      method: card,
      reference: 'ch_7K21QF',
      amount: STALL_FEE,
      status: 'paid',
      lateDays: 0,
    },
    {
      date: '12 Aug 2026',
      marketSlug: templeBar!.marketSlug,
      market: templeBar!.market,
      period: `Sat 15 Aug · ${stallOf(templeBar!)}`,
      method: card,
      reference: 'ch_7J04LM',
      amount: STALL_FEE,
      status: 'paid',
      lateDays: 0,
    },
    {
      date: '11 Aug 2026',
      marketSlug: marlayPark!.marketSlug,
      market: marlayPark!.market,
      period: `Sat 15 Aug · ${stallOf(marlayPark!)}`,
      method: card,
      reference: 'ch_7J03PA',
      amount: STALL_FEE,
      status: 'paid',
      lateDays: 0,
    },
    {
      date: '5 Aug 2026',
      marketSlug: paused!.marketSlug,
      market: paused!.market,
      period: 'August · paused',
      method: 'Bank transfer',
      reference: 'waived by Gráinne',
      amount: 0,
      status: 'waived',
      lateDays: 0,
    },
    {
      date: '2 Aug 2026',
      marketSlug: templeBar!.marketSlug,
      market: templeBar!.market,
      period: `Sat 1 Aug · ${stallOf(templeBar!)}`,
      method: card,
      reference: 're_7H88DR',
      amount: -STALL_FEE,
      status: 'refunded',
      lateDays: 0,
    },
    {
      date: '29 Jul 2026',
      marketSlug: marlayPark!.marketSlug,
      market: marlayPark!.market,
      period: `Sat 1 Aug · ${stallOf(marlayPark!)}`,
      method: card,
      reference: 'ch_7H61WQ',
      amount: STALL_FEE,
      status: 'paid',
      lateDays: 0,
    },
  ];

  // The year behind them: one charge per market per Saturday, back to January.
  // Two were settled late, so "paid on time" is a tally worth showing.
  const history: Seed[] = [];
  const saturdays = [
    ['25 Jul 2026', 'Sat 25 Jul'],
    ['18 Jul 2026', 'Sat 18 Jul'],
    ['11 Jul 2026', 'Sat 11 Jul'],
    ['27 Jun 2026', 'Sat 27 Jun'],
    ['13 Jun 2026', 'Sat 13 Jun'],
    ['30 May 2026', 'Sat 30 May'],
    ['16 May 2026', 'Sat 16 May'],
    ['25 Apr 2026', 'Sat 25 Apr'],
    ['11 Apr 2026', 'Sat 11 Apr'],
    ['28 Mar 2026', 'Sat 28 Mar'],
    ['14 Mar 2026', 'Sat 14 Mar'],
    ['28 Feb 2026', 'Sat 28 Feb'],
    ['14 Feb 2026', 'Sat 14 Feb'],
    ['24 Jan 2026', 'Sat 24 Jan'],
  ];
  saturdays.forEach(([date, day], i) => {
    for (const membership of [templeBar!, marlayPark!]) {
      const late = i === 4 && membership === marlayPark! ? 3 : i === 9 ? 1 : 0;
      history.push({
        date: date!,
        marketSlug: membership.marketSlug,
        market: membership.market,
        period: `${day} · ${stallOf(membership)}`,
        method: card,
        reference: `ch_7${(7000 - i * 61).toString(36).toUpperCase()}`,
        amount: STALL_FEE,
        status: 'paid',
        lateDays: late,
      });
    }
  });

  return [...designed, ...history];
}

/** A short ledger for any other vendor, so every Payments tab opens. */
function genericSeeds(vendor: VendorSummary, memberships: readonly VendorMembership[]): Seed[] {
  const owed = vendor.standing === 'fee-unpaid';
  return memberships.flatMap((membership, m) =>
    ['15 Aug 2026', '8 Aug 2026', '1 Aug 2026', '25 Jul 2026'].map((date, i) => ({
      date,
      marketSlug: membership.marketSlug,
      market: membership.market,
      period: `${date.slice(0, -5)} · ${stallOf(membership)}`,
      method: membership.paused ? 'Bank transfer' : 'Card ···· 2201',
      reference: owed && m === 0 && i === 0 ? 'attempt failed' : `ch_6${m}${i}QF`,
      amount: STALL_FEE,
      status: (owed && m === 0 && i === 0 ? 'due' : 'paid') as StallPayment['status'],
      lateDays: owed && m === 0 && i === 0 ? 2 : 0,
    })),
  );
}

function toPayments(seeds: readonly Seed[], slug: string): StallPayment[] {
  // Seeds are written most-recent-first, so the index is the sort key.
  return seeds.map((seed, i) => ({ ...seed, id: `pay-${slug}-${i}`, sortKey: seeds.length - i }));
}

/** The membership list a ledger is built from — McNally's, or a derived one. */
function membershipsOf(vendor: VendorSummary): readonly VendorMembership[] {
  if (vendor.slug === MCNALLY_DETAIL.slug) return MCNALLY_DETAIL.memberships;
  return vendor.markets.map<VendorMembership>((label, i) => ({
    id: `mem-${i}`,
    market: label,
    marketSlug: slugForLabel(label),
    badges: [],
    detail: `Stall ${i + 1}`,
    facts:
      vendor.standing === 'fee-unpaid' && i === 0 ? [{ label: 'Fee due', emphasis: true }] : [],
    paused: vendor.standing === 'paused',
  }));
}

/**
 * The ledger a vendor starts the session with, or `null` when no vendor has
 * that slug. Exported so tests can stand a synchronous repository on the very
 * fixture the app ships.
 */
export function buildLedger(vendorSlug: string): VendorLedger | null {
  const vendor = VENDORS_FIXTURE.find((candidate) => candidate.slug === vendorSlug);
  if (!vendor) return null;

  const memberships = membershipsOf(vendor);
  const mcnally = vendor.slug === MCNALLY_DETAIL.slug;
  // Two markets and a paused one is what the hand-written ledger assumes.
  const seeds =
    mcnally && memberships.length >= 3
      ? mcnallySeeds(memberships)
      : genericSeeds(vendor, memberships);

  return {
    vendorSlug,
    payments: toPayments(seeds, vendorSlug),
    feeLines: feeLinesFor(memberships),
    method: mcnally
      ? {
          label: 'Visa ···· 4417',
          holder: `${vendor.staff[0] ?? 'The owner'} · expires 09/28`,
          note: `Charged automatically on the Monday before each market day. ${
            memberships.find((membership) => membership.paused)?.market ?? 'A paused market'
          } invoices by bank transfer instead.`,
        }
      : null,
    nextChargeOn: 'Mon 25 Aug',
  };
}

@Injectable()
export class InMemoryPaymentRepository extends PaymentRepository {
  /**
   * One ledger per vendor, built on first read and mutable for the rest of the
   * session — marking paid, waiving and chasing are real here, so the banner
   * and the tallies move the way they would against a server.
   */
  private readonly ledgers = new Map<string, VendorLedger>();

  override ledger(vendorSlug: string): Observable<VendorLedger> {
    const ledger = this.ledgers.get(vendorSlug) ?? buildLedger(vendorSlug);
    if (!ledger) {
      return throwError(() => new Error(`No vendor matches “${vendorSlug}”.`)).pipe(delay(300));
    }
    this.ledgers.set(vendorSlug, ledger);
    return of(ledger).pipe(delay(300));
  }

  override markPaid(vendorSlug: string, paymentId: string): Observable<StallPayment> {
    return this.settle(vendorSlug, paymentId, (payment) => ({
      ...payment,
      status: 'paid',
      reference: 'recorded in the console',
    }));
  }

  override waive(vendorSlug: string, paymentId: string, reason: string): Observable<StallPayment> {
    const trimmed = reason.trim();
    if (trimmed === '') {
      return throwError(() => new Error('A waiver needs a reason.')).pipe(delay(200));
    }
    return this.settle(vendorSlug, paymentId, (payment) => ({
      ...payment,
      status: 'waived',
      amount: 0,
      reference: trimmed,
      lateDays: 0,
    }));
  }

  override sendReminder(vendorSlug: string, paymentId: string): Observable<StallPayment> {
    return this.settle(vendorSlug, paymentId, (payment) => ({
      ...payment,
      reference: 'reminder sent just now',
    }));
  }

  /** Rewrites one line, and keeps the fee lines in step with it. */
  private settle(
    vendorSlug: string,
    paymentId: string,
    map: (payment: StallPayment) => StallPayment,
  ): Observable<StallPayment> {
    const ledger = this.ledgers.get(vendorSlug);
    const current = ledger?.payments.find((payment) => payment.id === paymentId);
    if (!ledger || !current) {
      return throwError(() => new Error('That invoice is no longer open.')).pipe(delay(200));
    }
    if (current.status !== 'due') {
      return throwError(() => new Error('That invoice is already settled.')).pipe(delay(200));
    }

    const updated = map(current);
    const payments = ledger.payments.map((payment) =>
      payment.id === paymentId ? updated : payment,
    );
    const stillDue = (slug: string) =>
      payments.some((payment) => payment.marketSlug === slug && payment.status === 'due');
    this.ledgers.set(vendorSlug, {
      ...ledger,
      payments,
      feeLines: ledger.feeLines.map((line) =>
        line.paused || stillDue(line.marketSlug)
          ? line
          : { ...line, state: 'Paid to 22 Aug', tone: 'positive' as const },
      ),
    });
    return of(updated).pipe(delay(200));
  }
}

/** The market slug behind a short label, for vendors built from their summary. */
function slugForLabel(label: string): string {
  const entry = Object.entries(MARKET_LABELS).find(([, value]) => value === label);
  return (
    entry?.[0] ??
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  );
}
