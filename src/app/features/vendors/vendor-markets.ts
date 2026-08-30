import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { StatusPill } from '../../shared/components/status-pill/status-pill';
import { Avatar } from '../../shared/components/avatar/avatar';
import { EmptyState } from '../../shared/components/empty-state/empty-state';
import { VendorDetailFacade } from './vendor-detail-facade';

/**
 * The Markets tab of a vendor (design 1b): the application waiting on a
 * decision, one card per market membership, and a rail summarising the vendor
 * across all of them. Reads the shell's facade — it never loads on its own.
 */
@Component({
  selector: 'md-vendor-markets',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    StatusPill,
    Avatar,
    EmptyState,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatTooltipModule,
  ],
  templateUrl: './vendor-markets.html',
  styleUrl: './vendor-markets.css',
})
export class VendorMarkets {
  protected readonly facade = inject(VendorDetailFacade);
  protected readonly vendor = this.facade.vendor;
}
