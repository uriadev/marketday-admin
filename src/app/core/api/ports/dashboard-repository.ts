import { Observable } from 'rxjs';
import { OverviewSnapshot } from '../../models/overview.model';

/**
 * Port for the Overview screen's data. One narrow method per screen keeps the
 * dashboard independent of every other aggregate (interface segregation): a
 * change to support ticketing cannot break this.
 */
export abstract class DashboardRepository {
  abstract overview(): Observable<OverviewSnapshot>;
}
