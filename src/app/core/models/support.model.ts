/**
 * What an enquiry is about. Mirrors the backend's `SupportCategory`
 * (`../backend/src/common/enums/support-category.enum.ts`).
 */
export enum SupportCategory {
  Bug = 'BUG',
  Orders = 'ORDERS',
  Payments = 'PAYMENTS',
  Account = 'ACCOUNT',
  Other = 'OTHER',
}

/**
 * How the enquiry reached the console. This is a different axis from
 * {@link SupportCategory} — one says what it is about, this says where it came
 * from — and it is the one the design tags and filters on.
 *
 * Console-only for now: `support_messages` has no source column, so the
 * GraphQL adapter will derive it (a message with a vendor behind it is vendor
 * help, one with `emailSentAt` is email, the rest is the contact form).
 */
export type EnquirySource = 'vendor-help' | 'contact-form' | 'email';

export const ENQUIRY_SOURCES: readonly { value: EnquirySource; label: string }[] = [
  { value: 'vendor-help', label: 'Vendor help' },
  { value: 'contact-form', label: 'Contact form' },
  { value: 'email', label: 'Email' },
];

/** Console-only, like {@link EnquirySource}: the backend stores no status yet. */
export type EnquiryStatus = 'open' | 'resolved';

/** One row of the inbox list (design 1j). */
export interface EnquirySummary {
  id: string;
  /** Who wrote in — "Tom McNally", "Bantry Market". */
  who: string;
  subject: string;
  /** First line of the message, truncated for the list. */
  snippet: string;
  /** How long ago it arrived — "3h", "2d". */
  age: string;
  /** Hours since it arrived; what `overdue` and the age sort are computed from. */
  ageHours: number;
  source: EnquirySource;
  status: EnquiryStatus;
  category: SupportCategory;
  /** `null` shows as the "Unassigned" tag. */
  assignee: string | null;
}

/** Who wrote a message, which decides how the thread draws it. */
export type MessageKind = 'incoming' | 'note' | 'reply';

export interface EnquiryMessage {
  id: string;
  author: string;
  /** "3h ago · vendor help form". */
  meta: string;
  body: string;
  kind: MessageKind;
}

/** One open enquiry, with everything the thread pane renders (design 1j). */
export interface EnquiryThread {
  id: string;
  subject: string;
  /** "Tom McNally · McNally Family Farm · Temple Bar · opened 3h ago". */
  meta: string;
  status: EnquiryStatus;
  assignee: string | null;
  /** First name the composer addresses — "Write a reply to Tom…". */
  replyTo: string;
  messages: readonly EnquiryMessage[];
}

export interface SupportFilters {
  q: string;
  source: EnquirySource | null;
  /** `'all'` rather than `null`, because "Open" is the useful default. */
  status: EnquiryStatus | 'all';
  assignee: string | null;
}

export const EMPTY_SUPPORT_FILTERS: SupportFilters = {
  q: '',
  source: null,
  status: 'open',
  assignee: null,
};

/** An enquiry still open after two days is one the team has let slip. */
export const OVERDUE_AFTER_HOURS = 48;

export function isOverdue(enquiry: EnquirySummary): boolean {
  return enquiry.status === 'open' && enquiry.ageHours >= OVERDUE_AFTER_HOURS;
}
