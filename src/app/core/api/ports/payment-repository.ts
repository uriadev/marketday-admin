import { Observable } from 'rxjs';
import { StallPayment, VendorLedger } from '../../models/payment.model';

/**
 * Port for one vendor's stall fees across every membership (design 2b) — one
 * ledger, not one per market, because the question an admin asks is "are they
 * paid up", not "are they paid up here".
 *
 * The three commands are the three things an admin does to an open invoice.
 * `markPaid` records money that arrived some other way; `waive` cancels the
 * charge and keeps the reason; `sendReminder` changes nothing but the fact
 * that they were asked.
 */
export abstract class PaymentRepository {
  /** Rejects with an error when no vendor matches `vendorSlug`. */
  abstract ledger(vendorSlug: string): Observable<VendorLedger>;

  /** Settles an open invoice — money that came in outside the card run. */
  abstract markPaid(vendorSlug: string, paymentId: string): Observable<StallPayment>;

  /** Cancels the charge, recording `reason` against the membership. */
  abstract waive(vendorSlug: string, paymentId: string, reason: string): Observable<StallPayment>;

  /** Chases an open invoice. Returns the line with the chase recorded on it. */
  abstract sendReminder(vendorSlug: string, paymentId: string): Observable<StallPayment>;
}
