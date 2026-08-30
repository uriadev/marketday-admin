/**
 * What happened to one stall fee (design 2b). A `due` invoice is the only one
 * with anything to act on; the other three are history.
 */
export type PaymentStatus = 'paid' | 'due' | 'waived' | 'refunded';

/**
 * One line of a vendor's fee ledger — a single market day at a single market.
 *
 * Note for the GraphQL swap: the backend carries `Market.stallFeePerDay` and
 * nothing else about money — there is **no invoice, charge or ledger type** in
 * the schema yet. Everything below is a console model waiting for the API to
 * grow one, so this port is the first that will need real server work rather
 * than a mapping layer.
 */
export interface StallPayment {
  id: string;
  /** When the charge was taken or attempted — "20 Aug 2026". */
  date: string;
  /** Sorts the ledger without parsing the display date. */
  sortKey: number;
  marketSlug: string;
  /** Full market name — "Marlay Park Market". */
  market: string;
  /** The day being charged for — "Sat 22 Aug · stall 12". */
  period: string;
  /** "Card ···· 4417", "Bank transfer". */
  method: string;
  /** "ch_7K21QF", "attempt failed", "waived by Gráinne". */
  reference: string;
  /** Euro. Negative for a refund, zero for a waiver. */
  amount: number;
  status: PaymentStatus;
  /**
   * Days past the due date. Drives both "Due · 2 days late" and the
   * paid-on-time tally, so lateness is recorded once and read twice.
   */
  lateDays: number;
}

/** What a vendor is charged at one market, and where that stands. */
export interface FeeLine {
  marketSlug: string;
  market: string;
  /** "€35 per day · weekly, card". */
  terms: string;
  /** Euro per market day — what the next charge is built from. */
  perDay: number;
  /** Nothing is charged while a membership is paused. */
  paused: boolean;
  /** "Paid to 22 Aug", "€35 due since 20 Aug". */
  state: string;
  tone: 'positive' | 'alert' | 'muted';
}

/** The card the fees are taken from, as the rail shows it. */
export interface PaymentMethod {
  /** "Visa ···· 4417". */
  label: string;
  /** "Tom McNally · expires 09/28". */
  holder: string;
  /** How and when it is charged, including any market that differs. */
  note: string;
}

/** Everything the Payments tab loads in one call. */
export interface VendorLedger {
  vendorSlug: string;
  payments: readonly StallPayment[];
  feeLines: readonly FeeLine[];
  method: PaymentMethod | null;
  /** When the next charge goes out — "Mon 25 Aug". */
  nextChargeOn: string;
}

/** How far back the ledger is shown. Each one is a query param (§7). */
export type LedgerPeriod = 'sixMonths' | 'thisYear' | 'all';

export const LEDGER_PERIODS: readonly { value: LedgerPeriod; label: string }[] = [
  { value: 'sixMonths', label: 'Last 6 months' },
  { value: 'thisYear', label: 'This year' },
  { value: 'all', label: 'All time' },
];

export interface PaymentFilters {
  /** Market slug, or `null` for every market. */
  market: string | null;
  period: LedgerPeriod;
}

export const EMPTY_PAYMENT_FILTERS: PaymentFilters = {
  market: null,
  period: 'sixMonths',
};

/** What the waive dialog hands back. */
export interface WaiveRequest {
  paymentId: string;
  reason: string;
}
