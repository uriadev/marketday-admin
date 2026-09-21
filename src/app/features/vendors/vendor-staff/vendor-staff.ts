import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { StatusPill } from '../../../shared/components/status-pill/status-pill';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import {
  ConfirmDialog,
  ConfirmDialogData,
} from '../../../shared/components/confirm-dialog/confirm-dialog';
import { VendorRepository } from '../../../core/api/ports/vendor-repository';
import {
  VendorDetail,
  VendorMemberRole,
  VendorStaffInvite,
  VendorStaffMember,
} from '../../../core/models/vendor.model';
import { Notifications } from '../../../core/notifications/notifications';
import { VendorDetailFacade } from '../vendor-detail-facade';
import { StaffMarketOption } from '../staff-market-option';
import {
  InviteStaffDialog,
  InviteStaffDialogData,
} from '../invite-staff-dialog/invite-staff-dialog';
import { MoveStaffDialog, MoveStaffDialogData } from '../move-staff-dialog/move-staff-dialog';

/**
 * The Staff tab of a vendor (design 1c): who can sign in to the vendor app,
 * which market each of them works, and the invitations still out. Reads the
 * shell's facade — the team arrives with the vendor, so there is nothing to
 * load here — and reloads it after every write, because a row is a seat, an
 * invitation and a market folded together and no single mutation returns that.
 *
 * The vendor's owner edits the same list from their own app; this is the
 * platform admin's copy of it, and every operation on it is the same
 * `VendorMembersResolver` mutation with the vendor named rather than inferred
 * from a seat.
 *
 * Two things the roster cannot do, and the menu says which is which. **Make an
 * owner** has no endpoint at all — `updateVendorMember` moves a stall and
 * deliberately does not touch `role`, and there is no mutation that hands a
 * business to somebody else (`docs/backend-api-gaps.md` §9). **Removing the
 * owner** is refused on purpose: their seat is the only route back into the
 * business, so it is disabled here and refused server-side either way.
 */
@Component({
  selector: 'md-vendor-staff',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    StatusPill,
    Avatar,
    EmptyState,
    MatButtonModule,
    MatDialogModule,
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
  private readonly dialog = inject(MatDialog);
  private readonly repo = inject(VendorRepository);
  private readonly notifications = inject(Notifications);

  protected readonly vendor = this.facade.vendor;
  protected readonly columns = ['person', 'contact', 'access', 'actions'];

  protected readonly staff = computed(() => this.vendor()?.staff ?? []);

  /** "All markets" plus every market this vendor trades at. */
  protected readonly marketScopes = computed(() =>
    (this.vendor()?.memberships ?? []).map((membership) => membership.market),
  );

  /** The stalls a seat can be pinned to — what both dialogs offer. */
  protected readonly marketOptions = computed<readonly StaffMarketOption[]>(() =>
    (this.vendor()?.memberships ?? []).map((membership) => ({
      slug: membership.marketSlug,
      name: membership.market,
    })),
  );

  /**
   * A seat is pinned to one of the vendor's markets, so a business that trades
   * nowhere has no stall to invite anyone onto — the backend refuses it, and
   * the button says so rather than opening a dialog with an empty menu.
   */
  protected readonly canInvite = computed(() => this.marketOptions().length > 0);

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

  /**
   * "5 people, 1 invitation pending". The people are the **seated** rows: an
   * invitation is an offer, and counting it would have the line promise staff
   * the vendor does not have yet.
   */
  protected readonly summary = computed(() => {
    const pending = this.staff().filter((person) => person.pending).length;
    const people = this.staff().length - pending;
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

  /** A stallholder can be moved; an owner spans every market already. */
  protected canMove(person: VendorStaffMember): boolean {
    return !person.pending && !person.allMarkets;
  }

  /** Everyone but the owner — and an invitation, which seats nobody yet. */
  protected canRemove(person: VendorStaffMember): boolean {
    return !person.pending && person.memberRole !== VendorMemberRole.Owner;
  }

  protected invite(): void {
    const vendor = this.vendor();
    if (!vendor) return;

    const data: InviteStaffDialogData = {
      vendorName: vendor.name,
      markets: this.marketOptions(),
    };
    this.dialog
      .open<InviteStaffDialog, InviteStaffDialogData, VendorStaffInvite>(InviteStaffDialog, {
        data,
        width: '520px',
      })
      .afterClosed()
      .subscribe((invite) => {
        if (!invite) return;
        this.write(
          this.repo.inviteStaff(vendor.slug, invite),
          vendor,
          `Invitation sent to ${invite.email}.`,
          `That invitation to ${invite.email} could not be sent.`,
        );
      });
  }

  /**
   * Sends the invitation again. The backend supersedes the outstanding code
   * rather than minting a second one, so this is safe to press twice — and it
   * is the only thing to be done for somebody who never got the first.
   */
  protected resend(person: VendorStaffMember): void {
    const vendor = this.vendor();
    if (!vendor || !person.pending) return;
    const marketSlug = person.marketSlugs[0];
    if (!marketSlug) return;

    this.write(
      this.repo.inviteStaff(vendor.slug, { email: person.email, marketSlug }),
      vendor,
      `Invitation sent again to ${person.email}.`,
      `That invitation to ${person.email} could not be sent again.`,
    );
  }

  protected cancelInvite(person: VendorStaffMember): void {
    const vendor = this.vendor();
    const inviteId = person.inviteId;
    if (!vendor || !inviteId) return;

    const data: ConfirmDialogData = {
      title: `Withdraw the invitation to ${person.email}?`,
      body:
        `Their code stops working. Nobody is removed, because nobody was added — you can invite ` +
        `the same address again whenever you like.`,
      confirmLabel: 'Withdraw invitation',
      cancelLabel: 'Leave it open',
    };
    this.confirmThen(data, () =>
      this.write(
        this.repo.revokeStaffInvite(vendor.slug, inviteId),
        vendor,
        `The invitation to ${person.email} was withdrawn.`,
        `That invitation to ${person.email} could not be withdrawn.`,
      ),
    );
  }

  protected move(person: VendorStaffMember): void {
    const vendor = this.vendor();
    if (!vendor || !this.canMove(person)) return;

    const data: MoveStaffDialogData = {
      personName: person.name,
      vendorName: vendor.name,
      markets: this.marketOptions(),
      currentSlug: person.marketSlugs[0] ?? null,
    };
    this.dialog
      .open<MoveStaffDialog, MoveStaffDialogData, string>(MoveStaffDialog, {
        data,
        width: '480px',
      })
      .afterClosed()
      .subscribe((marketSlug) => {
        if (!marketSlug) return;
        const market = this.marketOptions().find((option) => option.slug === marketSlug);
        this.write(
          this.repo.moveStaffToMarket(vendor.slug, person.id, marketSlug),
          vendor,
          `${person.name} now works ${market?.name ?? 'that market'}.`,
          `${person.name} could not be moved.`,
        );
      });
  }

  protected remove(person: VendorStaffMember): void {
    const vendor = this.vendor();
    if (!vendor || !this.canRemove(person)) return;

    const data: ConfirmDialogData = {
      title: `Remove ${person.name} from ${vendor.name}?`,
      body:
        `They are signed out of the vendor app and their account drops back to an ordinary ` +
        `shopper’s — they keep it, and their orders, but stop seeing this business entirely. ` +
        `Inviting them again starts from scratch.`,
      confirmLabel: 'Remove from vendor',
      cancelLabel: 'Keep them',
    };
    this.confirmThen(data, () =>
      this.write(
        this.repo.removeStaff(vendor.slug, person.id),
        vendor,
        `${person.name} is no longer on ${vendor.name}’s team.`,
        `${person.name} could not be removed.`,
      ),
    );
  }

  private confirmThen(data: ConfirmDialogData, run: () => void): void {
    this.dialog
      .open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, { data, width: '480px' })
      .afterClosed()
      .subscribe((confirmed) => {
        if (confirmed) run();
      });
  }

  /**
   * Every write on this tab ends the same way: reload the vendor, then say what
   * happened. The reload is what folds seats, invitations and markets back into
   * rows — see `VendorRepository`'s team methods for why none of the mutations
   * answers with something this screen could draw.
   */
  private write(call: Observable<void>, vendor: VendorDetail, done: string, failed: string): void {
    call.subscribe({
      next: () => {
        this.facade.load(vendor.slug);
        this.notifications.success(done);
      },
      error: (cause: unknown) =>
        this.notifications.error(cause instanceof Error ? cause.message : failed),
    });
  }
}
