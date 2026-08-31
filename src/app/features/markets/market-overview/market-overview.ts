import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { StatTile } from '../../../shared/components/stat-tile/stat-tile';
import { StatusPill } from '../../../shared/components/status-pill/status-pill';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { MarketDetailFacade } from '../market-detail-facade';

/**
 * The Overview tab of a market (design 1g): the day's numbers, the stall map,
 * this week's vendors, and a rail of things needing the organiser's attention.
 * Reads the shell's facade — it never loads on its own.
 */
@Component({
  selector: 'md-market-overview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    StatTile,
    StatusPill,
    Avatar,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatIconModule,
    MatTooltipModule,
  ],
  templateUrl: './market-overview.html',
  styleUrl: './market-overview.css',
})
export class MarketOverview {
  protected readonly facade = inject(MarketDetailFacade);
  protected readonly market = this.facade.market;
}
