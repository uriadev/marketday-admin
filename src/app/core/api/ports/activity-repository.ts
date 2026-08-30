import { Observable } from 'rxjs';
import { ActivityFeed, ActivityFilters } from '../../models/activity.model';

/**
 * Port for one vendor's audit log (design 2c) — who changed what, in order.
 *
 * Unlike the other directories, this one filters and pages **server-side**: an
 * audit log is unbounded, so narrowing it client-side over whatever happens to
 * be loaded would answer the wrong question. `before` is the `sortKey` of the
 * oldest entry already on screen, which is what "Load older activity" sends.
 */
export abstract class ActivityRepository {
  /** Rejects with an error when no vendor matches `vendorSlug`. */
  abstract feed(
    vendorSlug: string,
    filters: ActivityFilters,
    before?: number,
  ): Observable<ActivityFeed>;
}
