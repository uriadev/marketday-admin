import { Observable } from 'rxjs';
import { PickerOption } from '../../models/picker-option.model';
import {
  LatLng,
  PromotionDirectoryPage,
  PromotionDraft,
  PromotionForm,
  PromotionListQuery,
  PromotionPrefill,
  PromotionRecord,
  PromotionStatus,
  PromotionTargetKind,
} from '../../models/promotion.model';

/**
 * Port for promotions (`../backend/specs/market-events-proposal.md` Part 2) —
 * the Promotions list and the promotion form. Admin-only: every promotion is
 * reviewed by hand, and nothing reaches `scheduled` without an admin.
 */
export abstract class PromotionRepository {
  /** One page, narrowed and counted, with the header's per-status counts. */
  abstract list(query: PromotionListQuery): Observable<PromotionDirectoryPage>;

  /**
   * The promotion (or `null` on `/promotions/new`), the markets it can be
   * scoped to, and the subject a prefill link named. Rejects when `id` names
   * no promotion.
   */
  abstract form(id: string | null, prefill: PromotionPrefill | null): Observable<PromotionForm>;

  abstract create(draft: PromotionDraft): Observable<PromotionRecord>;

  /** The subject and the status are not touched; see {@link setStatus}. */
  abstract update(id: string, draft: PromotionDraft): Observable<PromotionRecord>;

  /**
   * The operational switch — schedule, pause, resume — kept apart from the
   * form so a save can never undo a pause. Scheduling is refused once the
   * period has ended.
   */
  abstract setStatus(id: string, status: PromotionStatus): Observable<PromotionRecord>;

  /** Hard delete. */
  abstract remove(id: string): Observable<void>;

  /** Subjects of `kind` whose name matches `query`. Not used for a link. */
  abstract searchSubjects(
    kind: Exclude<PromotionTargetKind, 'link' | 'market'>,
    query: string,
  ): Observable<readonly PickerOption[]>;

  /** A vendor's products, for a product subject (picked vendor first). */
  abstract productsOf(vendorId: string): Observable<readonly PickerOption[]>;

  /**
   * Where a reach centred on the subject should sit: an event's or a market's
   * point, or for a vendor or product the centroid of the vendor's markets.
   * `null` when there is none (a vendor at no markets).
   */
  abstract suggestedReach(kind: PromotionTargetKind, id: string): Observable<LatLng | null>;
}
