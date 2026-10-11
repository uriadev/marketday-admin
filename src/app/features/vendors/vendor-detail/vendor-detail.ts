import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTabsModule } from '@angular/material/tabs';
import { MatBadgeModule } from '@angular/material/badge';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusPill } from '../../../shared/components/status-pill/status-pill';
import { Avatar } from '../../../shared/components/avatar/avatar';
import {
  ConfirmDialog,
  ConfirmDialogData,
} from '../../../shared/components/confirm-dialog/confirm-dialog';
import { Notifications } from '../../../core/notifications/notifications';
import { VendorDetail as VendorDetailModel, VendorKind } from '../../../core/models/vendor.model';
import { VendorDetailFacade } from '../vendor-detail-facade';

/**
 * The shell around one vendor (design 1b): breadcrumb header, the vendor's
 * identity strip, and the routed tab bar. Markets is the only tab with a screen
 * behind it today, so the rest are disabled links rather than dead routes.
 */
@Component({
  selector: 'md-vendor-detail',
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
    MatBadgeModule,
    MatDialogModule,
  ],
  templateUrl: './vendor-detail.html',
  styleUrl: './vendor-detail.css',
})
export class VendorDetail {
  /** Bound from the `:slug` route param by `withComponentInputBinding()`. */
  readonly slug = input.required<string>();

  protected readonly facade = inject(VendorDetailFacade);
  protected readonly vendor = this.facade.vendor;

  protected readonly heading = computed(() => this.vendor()?.name ?? 'Vendor');
  protected readonly foodTruck = VendorKind.FoodTruck;

  private readonly dialog = inject(MatDialog);
  private readonly notifications = inject(Notifications);

  constructor() {
    effect(() => this.facade.load(this.slug()));
  }

  /**
   * Turns the vendor into a food truck, or back into a stall holder — an admin
   * decision the owner cannot make (`setVendorKind`). Confirmed first because
   * it changes what the owner's app offers them. Going back is refused
   * server-side while the truck still hosts stops; that message is shown as it
   * comes.
   */
  protected changeKind(vendor: VendorDetailModel): void {
    const toTruck = vendor.kind !== VendorKind.FoodTruck;
    const data: ConfirmDialogData = toTruck
      ? {
          title: `Make ${vendor.name} a food truck?`,
          body:
            `Its owner can then add stops of their own in the vendor app — recurring places ` +
            `and times where shoppers pre-order and collect. It keeps every market it trades at ` +
            `today and can still join more.`,
          confirmLabel: 'Make a food truck',
          cancelLabel: 'Cancel',
        }
      : {
          title: `Make ${vendor.name} a stall holder?`,
          body:
            vendor.stopCount > 0
              ? `It still hosts ${vendor.stopCount} ${vendor.stopCount === 1 ? 'stop' : 'stops'}, ` +
                `so this will be refused until the owner removes them in the vendor app.`
              : `It can no longer add stops of its own. Its markets are unchanged.`,
          confirmLabel: 'Make a stall holder',
          cancelLabel: 'Cancel',
        };
    this.dialog
      .open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, { data, width: '480px' })
      .afterClosed()
      .subscribe((confirmed) => {
        if (!confirmed) return;
        const kind = toTruck ? VendorKind.FoodTruck : VendorKind.StallHolder;
        this.facade.setKind(kind, (error) =>
          error
            ? this.notifications.error(error)
            : this.notifications.success(
                `${vendor.name} is now ${toTruck ? 'a food truck' : 'a stall holder'}.`,
              ),
        );
      });
  }
}
