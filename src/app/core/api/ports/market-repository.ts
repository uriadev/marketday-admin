import { Observable } from 'rxjs';
import { MarketDetail, MarketDraft, MarketSummary } from '../../models/market.model';

/**
 * Port for the markets aggregate — the directory (design 1f) and one market's
 * management screens (design 1g).
 *
 * `list()` takes no filters on purpose: the design shows a market directory
 * small enough to hand over whole ("few enough to show as cards"), and
 * `MarketsStore` narrows it client-side so a filter change costs no round trip.
 * A server-side implementation can add a filtered overload without breaking
 * this signature.
 */
export abstract class MarketRepository {
  abstract list(): Observable<readonly MarketSummary[]>;
  /** Rejects with an error when no market matches `slug`. */
  abstract detail(slug: string): Observable<MarketDetail>;

  /** The counties a market may be in — reference data for the wizard's select. */
  abstract counties(): Observable<readonly string[]>;

  /**
   * Saves the wizard's work without making the market public. Called on every
   * step change, so it must be idempotent for a given draft.
   */
  abstract saveDraft(draft: MarketDraft): Observable<MarketSummary>;

  /** Publishes the draft — vendors can apply from this moment. */
  abstract publish(draft: MarketDraft): Observable<MarketSummary>;
}
