import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTabsModule } from '@angular/material/tabs';
import { MatBadgeModule } from '@angular/material/badge';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusPill } from '../../../shared/components/status-pill/status-pill';
import { Avatar } from '../../../shared/components/avatar/avatar';
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

  constructor() {
    effect(() => this.facade.load(this.slug()));
  }
}
