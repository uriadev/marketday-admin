import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  input,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFabAnchor } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCardModule } from '@angular/material/card';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ConsoleChrome } from '../../../layouts/console-layout/console-chrome';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusPill } from '../../../shared/components/status-pill/status-pill';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import { Avatar } from '../../../shared/components/avatar/avatar';
import {
  MARKET_SORTS,
  MarketFilters,
  MarketStatus,
  MarketSummary,
  MarketSort,
  TradingDay,
} from '../../../core/models/market.model';
import { MarketsStore } from '../markets-store';

/** The query params this screen owns. `undefined` means "not in the URL". */
type FilterParams = {
  [K in keyof MarketFilters]: string | null | undefined;
};

@Component({
  selector: 'md-markets',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    PageHeader,
    StatusPill,
    EmptyState,
    Avatar,
    MatButtonModule,
    MatFabAnchor,
    MatIconModule,
    MatMenuModule,
    MatFormFieldModule,
    MatInputModule,
    MatCardModule,
    MatTooltipModule,
    MatProgressBarModule,
  ],
  templateUrl: './markets.html',
  styleUrl: './markets.css',
})
export class Markets implements OnInit {
  protected readonly store = inject(MarketsStore);
  protected readonly chrome = inject(ConsoleChrome);
  private readonly router = inject(Router);

  /**
   * Filters arrive as query params (`../../../../docs/ARCHITECTURE.md` §7), bound
   * by `withComponentInputBinding()`. A param that isn't in the URL binds as
   * `undefined`, so every read normalises before it reaches the store.
   */
  readonly q = input<string>();
  readonly county = input<string>();
  readonly day = input<TradingDay>();
  readonly status = input<MarketStatus>();
  readonly sort = input<MarketSort>();

  protected readonly MarketStatus = MarketStatus;
  protected readonly sorts = MARKET_SORTS;

  protected readonly filters = computed<MarketFilters>(() => ({
    q: this.q() ?? '',
    county: this.county() ?? null,
    day: this.day() ?? null,
    status: this.status() ?? null,
    sort: this.sort() ?? 'next',
  }));

  protected readonly sortLabel = computed(
    () => MARKET_SORTS.find((option) => option.value === this.filters().sort)?.label ?? 'Sort',
  );

  protected readonly heading = computed(() => {
    const total = this.store.items().length;
    return `${total} ${total === 1 ? 'market' : 'markets'}`;
  });

  constructor() {
    // The URL is the source of truth; the store follows it.
    effect(() => this.store.setFilters(this.filters()));
  }

  ngOnInit(): void {
    this.store.load();
  }

  /** Writes one filter into the URL. `null` drops the param entirely. */
  protected setParam(patch: Partial<FilterParams>): void {
    void this.router.navigate([], {
      queryParams: patch,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected clearFilters(): void {
    this.setParam({ q: null, county: null, day: null, status: null });
  }

  protected onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.setParam({ q: value === '' ? null : value });
  }

  /** "Trading" is the only green badge; a draft warns, anything else is quiet. */
  protected badgeTone(market: MarketSummary): 'positive' | 'muted' | 'warn' {
    if (market.status === MarketStatus.Draft) return 'warn';
    return market.tradingToday && market.badgeLabel === 'Trading' ? 'positive' : 'muted';
  }
}
