import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { StatusPill } from '../../../shared/components/status-pill/status-pill';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import {
  ConfirmDialog,
  ConfirmDialogData,
} from '../../../shared/components/confirm-dialog/confirm-dialog';
import { VendorRepository } from '../../../core/api/ports/vendor-repository';
import { MarketSummary } from '../../../core/models/market.model';
import { VendorMembership } from '../../../core/models/vendor.model';
import { Notifications } from '../../../core/notifications/notifications';
import { VendorDetailFacade } from '../vendor-detail-facade';
import { AddMarketDialog, AddMarketDialogData } from '../add-market-dialog/add-market-dialog';

/**
 * The Markets tab of a vendor (design 1b): the application waiting on a
 * decision, one card per market membership, and a rail summarising the vendor
 * across all of them. Reads the shell's facade — it never loads on its own.
 *
 * Membership is the one thing it writes. **Add to a market** puts the vendor on
 * another market's roster and a card's **Remove** takes it off again, both
 * through `VendorRepository` — the same `joinMarket` / `leaveMarket` pair the
 * market's own Vendors tab sends, from the other end of the relation. Pausing a
 * stall and its lead time are still the owner's to set
 * (`docs/backend-api-gaps.md` #9), so *Manage membership* stays disabled.
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
    MatDialogModule,
    MatIconModule,
    MatTooltipModule,
  ],
  templateUrl: './vendor-markets.html',
  styleUrl: './vendor-markets.css',
})
export class VendorMarkets {
  protected readonly facade = inject(VendorDetailFacade);
  protected readonly vendor = this.facade.vendor;

  private readonly dialog = inject(MatDialog);
  private readonly repo = inject(VendorRepository);
  private readonly notifications = inject(Notifications);

  protected addMarket(): void {
    const vendor = this.vendor();
    if (!vendor) return;

    const data: AddMarketDialogData = {
      vendorName: vendor.name,
      joinedSlugs: vendor.memberships.map((membership) => membership.marketSlug),
    };
    this.dialog
      .open<AddMarketDialog, AddMarketDialogData, MarketSummary>(AddMarketDialog, {
        data,
        width: '520px',
      })
      .afterClosed()
      .subscribe((market) => {
        if (!market) return;
        this.repo.addToMarket(vendor.slug, market.slug).subscribe({
          next: () => {
            this.facade.load(vendor.slug);
            this.notifications.success(`${vendor.name} now trades at ${market.name}.`);
          },
          error: (cause: unknown) =>
            this.notifications.error(
              cause instanceof Error
                ? cause.message
                : `${vendor.name} could not be added to ${market.name}.`,
            ),
        });
      });
  }

  protected removeMembership(membership: VendorMembership): void {
    const vendor = this.vendor();
    if (!vendor) return;

    const data: ConfirmDialogData = {
      title: `Remove ${vendor.name} from ${membership.market}?`,
      body:
        `They stop trading there straight away. That market’s order lead time, any pause on ` +
        `the stall and the products they list there go with it — rejoining starts from the ` +
        `defaults. The vendor itself, its team and its other markets are untouched.`,
      confirmLabel: 'Remove from market',
      cancelLabel: 'Keep them',
    };
    this.dialog
      .open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, { data, width: '480px' })
      .afterClosed()
      .subscribe((confirmed) => {
        if (!confirmed) return;
        this.repo.removeFromMarket(vendor.slug, membership.marketSlug).subscribe({
          next: () => {
            this.facade.load(vendor.slug);
            this.notifications.success(`${vendor.name} no longer trades at ${membership.market}.`);
          },
          error: (cause: unknown) =>
            this.notifications.error(
              cause instanceof Error
                ? cause.message
                : `${vendor.name} could not be removed from ${membership.market}.`,
            ),
        });
      });
  }
}
