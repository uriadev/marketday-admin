import { Observable } from 'rxjs';
import { EnquiryMessage, EnquirySummary, EnquiryThread } from '../../models/support.model';

/**
 * Port for the support inbox (design 1j) — one queue, whatever the enquiry came
 * in through.
 *
 * `reply` and `resolve` are commands rather than a general `update`: they are
 * the only two things this screen does to an enquiry, and naming them keeps the
 * console from having to know how either is stored.
 */
export abstract class SupportRepository {
  abstract inbox(): Observable<readonly EnquirySummary[]>;
  /** Rejects with an error when no enquiry matches `id`. */
  abstract thread(id: string): Observable<EnquiryThread>;
  /** Appends a reply, or an internal note the person who wrote in never sees. */
  abstract reply(id: string, body: string, internal: boolean): Observable<EnquiryMessage>;
  abstract resolve(id: string): Observable<EnquirySummary>;
  abstract assign(id: string, assignee: string | null): Observable<EnquirySummary>;
}
