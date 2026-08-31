import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { StatusPill } from '../../../shared/components/status-pill/status-pill';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import { VendorStaffMember } from '../../../core/models/vendor.model';
import { VendorDetailFacade } from '../vendor-detail-facade';

/**
 * The Staff tab of a vendor (design 1c): who can sign in to the vendor app, and
 * which markets each of them can work at. Reads the shell's facade — the team
 * arrives with the vendor, so there is nothing to load here.
 *
 * The vendor edits the same list in their own app; this screen is the platform
 * admin's view of it.
 */
@Component({
  selector: 'md-vendor-staff',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    StatusPill,
    Avatar,
    EmptyState,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTableModule,
    MatTooltipModule,
  ],
  templateUrl: './vendor-staff.html',
  styleUrl: './vendor-staff.css',
})
export class VendorStaff {
  /** Market scope filter, from the query param (§7). */
  readonly market = input<string>();

  protected readonly facade = inject(VendorDetailFacade);
  private readonly router = inject(Router);

  protected readonly vendor = this.facade.vendor;
  protected readonly columns = ['person', 'contact', 'access', 'actions'];

  protected readonly staff = computed(() => this.vendor()?.staff ?? []);

  /** "All markets" plus every market this vendor trades at. */
  protected readonly marketScopes = computed(() =>
    (this.vendor()?.memberships ?? []).map((membership) => membership.market),
  );

  /** The scope currently selected, or `null` for all markets. */
  protected readonly scope = computed(() => this.market() ?? null);

  protected readonly visible = computed(() => {
    const scope = this.scope();
    if (scope === null) return this.staff();
    return this.staff().filter(
      // Someone scoped to the whole vendor can work at every market.
      (person) => person.allMarkets || person.markets.some((label) => scope.includes(label)),
    );
  });

  /** "5 people, 1 invitation pending". */
  protected readonly summary = computed(() => {
    const people = this.staff().length;
    const pending = this.staff().filter((person) => person.pending).length;
    const parts = [`${people} ${people === 1 ? 'person' : 'people'}`];
    if (pending > 0) {
      parts.push(`${pending} ${pending === 1 ? 'invitation' : 'invitations'} pending`);
    }
    return parts.join(', ');
  });

  protected setScope(market: string | null): void {
    void this.router.navigate([], {
      queryParams: { market },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /** A stallholder can be given another market; an owner already has them all,
   *  and a pending invite is not scoped until it is accepted. */
  protected canAddMarket(person: VendorStaffMember): boolean {
    return !person.allMarkets && !person.pending;
  }
}
