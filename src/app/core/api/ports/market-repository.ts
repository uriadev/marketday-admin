import { Observable } from 'rxjs';
import {
  MarketDetail,
  MarketDraft,
  MarketRoster,
  MarketSchedulePatch,
  MarketSettingsPatch,
  MarketStallPlan,
  MarketSummary,
} from '../../models/market.model';

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

  /**
   * The market's vendor roster and the applications waiting on it — the
   * Vendors tab. Separate from `detail()` because it is a different read for a
   * different screen: `detail()` is the market day, this is the membership
   * list, and neither should make the other wait.
   *
   * Rejects with an error when no market matches `slug`.
   */
  abstract roster(slug: string): Observable<MarketRoster>;

  /**
   * The market's stored trading pattern — the Schedule tab. Separate from
   * `detail()` for the same reason `roster()` is: the overview renders the
   * pattern as prose it cannot edit, and the tab needs the rule itself.
   *
   * Rejects with an error when no market matches `slug`.
   */
  abstract schedule(slug: string): Observable<MarketSchedulePatch>;

  /**
   * Replaces the trading pattern, answering with what was stored so the tab
   * re-seeds from the record rather than from what was typed.
   */
  abstract saveSchedule(slug: string, patch: MarketSchedulePatch): Observable<MarketSchedulePatch>;

  /**
   * Everything about a market except its trading pattern — the Settings tab.
   * Deliberately disjoint from `schedule()`: the two tabs own different halves
   * of the record, so saving one can never write a stale copy of the other.
   *
   * Rejects with an error when no market matches `slug`.
   */
  abstract settings(slug: string): Observable<MarketSettingsPatch>;

  /** Replaces those settings, answering with what was stored. */
  abstract saveSettings(slug: string, patch: MarketSettingsPatch): Observable<MarketSettingsPatch>;

  /**
   * The market's pitch layout and who stands on it — the Stalls tab. The plan
   * is the source of truth for the stall map and the stall count, so it is read
   * on its own rather than folded into `detail()`, which only renders it.
   *
   * Rejects with an error when no market matches `slug`.
   */
  abstract stallPlan(slug: string): Observable<MarketStallPlan>;

  /** Replaces the layout and its placements, answering with what was stored. */
  abstract saveStallPlan(slug: string, plan: MarketStallPlan): Observable<MarketStallPlan>;

  /** The counties a market may be in — reference data for the wizard's select. */
  abstract counties(): Observable<readonly string[]>;

  /**
   * The whole wizard payload for a market already stored — what the add-market
   * wizard re-opens a draft with. One read rather than `settings()` plus
   * `schedule()` because the wizard owns both halves of the record at once,
   * unlike the two manage tabs that split it between them.
   *
   * Rejects with an error when no market matches `slug`.
   */
  abstract draft(slug: string): Observable<MarketDraft>;

  /**
   * Saves the wizard's work without making the market public. Called on every
   * step change, so it must be idempotent for a given draft.
   */
  abstract saveDraft(draft: MarketDraft): Observable<MarketSummary>;

  /** Publishes the draft — vendors can apply from this moment. */
  abstract publish(draft: MarketDraft): Observable<MarketSummary>;
}
