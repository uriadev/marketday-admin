/** Everything the Overview screen (design 1e) renders, in one payload. */
export interface OverviewSnapshot {
  /** e.g. "Saturday 14 June" */
  today: string;
  /** One-line status under the date. */
  summary: string;
  stats: OverviewStat[];
  preorders: PreorderBar[];
  marketsToday: MarketToday[];
  pendingVendors: PendingVendor[];
  latestEnquiries: LatestEnquiry[];
}

export type StatTone = 'neutral' | 'positive' | 'alert';

export interface OverviewStat {
  label: string;
  value: string;
  /** Small supporting line under the number (delta, context). */
  hint: string;
  tone: StatTone;
}

export interface PreorderBar {
  label: string;
  /** 0–100, height of the bar as a percentage of the plot. */
  value: number;
  /** true for the most recent bars, so the chart can lift their weight. */
  emphasis: boolean;
}

export type MarketDayStatus = 'trading' | 'upcoming';

export interface MarketToday {
  name: string;
  hours: string;
  vendors: string;
  status: MarketDayStatus;
  statusLabel: string;
}

export interface PendingVendor {
  id: string;
  name: string;
  meta: string;
}

export type EnquiryUrgency = 'urgent' | 'normal';

export interface LatestEnquiry {
  id: string;
  title: string;
  meta: string;
  urgency: EnquiryUrgency;
}
