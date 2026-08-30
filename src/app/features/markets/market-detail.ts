import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { StatusPill } from '../../shared/components/status-pill/status-pill';
import { Avatar } from '../../shared/components/avatar/avatar';
import { MarketStatus } from '../../core/models/market.model';
import { MarketDetailFacade } from './market-detail-facade';

/**
 * The shell around one market (design 1g): breadcrumb header, the market's
 * identity strip, and the routed tab bar. The tab bodies are child routes —
 * only Overview exists today, so the rest are disabled links rather than dead
 * routes.
 */
@Component({
  selector: 'md-market-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    PageHeader,
    StatusPill,
    Avatar,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTabsModule,
    MatTooltipModule,
    MatProgressBarModule,
  ],
  templateUrl: './market-detail.html',
  styleUrl: './market-detail.css',
})
export class MarketDetail {
  /** Bound from the `:slug` route param by `withComponentInputBinding()`. */
  readonly slug = input.required<string>();

  protected readonly facade = inject(MarketDetailFacade);
  protected readonly market = this.facade.market;

  protected readonly heading = computed(() => this.market()?.name ?? 'Market');
  protected readonly badgeTone = computed<'positive' | 'muted' | 'warn'>(() => {
    const market = this.market();
    if (!market) return 'muted';
    if (market.status === MarketStatus.Draft) return 'warn';
    return market.tradingToday && market.badgeLabel === 'Trading' ? 'positive' : 'muted';
  });

  constructor() {
    effect(() => this.facade.load(this.slug()));
  }
}
