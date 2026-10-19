import { Observable } from 'rxjs';
import {
  EventDirectoryPage,
  EventDraft,
  EventForm,
  EventListQuery,
  EventRecord,
  EventStatus,
} from '../../models/event.model';
import { PickerOption } from '../../models/picker-option.model';

/**
 * Port for events (`../backend/specs/market-events-proposal.md` Part 1) — the
 * Events list and the event form. Admin-only on the backend, always: an event
 * is a free-text, image-bearing public surface, and admin authorship is what
 * keeps it from becoming a moderation queue.
 *
 * Every read here is status-blind (drafts and past events included), unlike
 * the public reads the app uses.
 */
export abstract class EventRepository {
  /** One page of events, narrowed and counted, with the header's counts. */
  abstract list(query: EventListQuery): Observable<EventDirectoryPage>;

  /**
   * The event (or `null` on `/events/new`) and the markets it could be held
   * at. Rejects when `id` names no event.
   */
  abstract form(id: string | null): Observable<EventForm>;

  abstract create(draft: EventDraft): Observable<EventRecord>;

  /** The venue is not editable; `draft.venueKind`, `marketId` and `vendorId` are ignored. */
  abstract update(id: string, draft: EventDraft): Observable<EventRecord>;

  /**
   * Publishes or unpublishes without touching anything else. Publishing is
   * refused when every session has already ended.
   */
  abstract setStatus(id: string, status: EventStatus): Observable<EventRecord>;

  /** Editorial, unpaid — the only thing that picks a reminder's headline. */
  abstract setFeatured(id: string, featured: boolean): Observable<EventRecord>;

  /** Hard delete. Promotions of the event go with it (the FK cascades). */
  abstract remove(id: string): Observable<void>;

  /** Vendors whose name matches `query`, for the vendor-venue picker. */
  abstract searchVendors(query: string): Observable<readonly PickerOption[]>;
}
