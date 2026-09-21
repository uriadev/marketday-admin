import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Observable, of, throwError } from 'rxjs';
import { VendorRepository } from '../../../core/api/ports/vendor-repository';
import {
  MCNALLY_DETAIL,
  MCNALLY_PROFILE,
  VENDORS_FIXTURE,
} from '../../../core/api/in-memory/in-memory-vendor-repository';
import {
  VendorDetail,
  VendorDirectoryPage,
  VendorInvite as VendorInviteModel,
  VendorInviteSummary,
  VendorMemberRole,
  VendorProfile,
  VendorProfilePatch,
  VendorStaffInvite,
  VendorSummary,
} from '../../../core/models/vendor.model';
import { VendorDetailFacade } from '../vendor-detail-facade';
import { VendorStaff } from './vendor-staff';

class StubVendorRepository extends VendorRepository {
  /** The directory is not what these tests are about — an empty page satisfies
   *  the port. */
  override list(): Observable<VendorDirectoryPage> {
    return of({
      items: [],
      total: 0,
      facets: { markets: [], applicationCount: 0, vendorCount: 0 },
    });
  }
  override detail(slug: string): Observable<VendorDetail> {
    if (slug !== MCNALLY_DETAIL.slug) {
      return throwError(() => new Error(`No vendor matches “${slug}”.`));
    }
    return of(MCNALLY_DETAIL);
  }
  override profile(): Observable<VendorProfile> {
    return of(MCNALLY_PROFILE);
  }
  override saveProfile(_slug: string, patch: VendorProfilePatch): Observable<VendorProfile> {
    return of({ ...MCNALLY_PROFILE, ...patch });
  }
  override setActive(): Observable<VendorSummary> {
    return of(VENDORS_FIXTURE[0]!);
  }
  /** Not a write these screens make; present so the port is satisfied. */
  override addToMarket(): Observable<void> {
    return of(undefined);
  }

  override removeFromMarket(): Observable<void> {
    return of(undefined);
  }

  /* The team writes, recorded rather than performed: what the tab sends is
     what these tests are about, and the row it draws afterwards comes from
     `detail()` either way. `refuse` turns the next one into a rejection. */
  readonly invited: [string, VendorStaffInvite][] = [];
  readonly revoked: [string, string][] = [];
  readonly moved: [string, string, string][] = [];
  readonly removed: [string, string][] = [];
  refuse: string | null = null;

  override inviteStaff(vendorSlug: string, invite: VendorStaffInvite): Observable<void> {
    if (this.refuse) return throwError(() => new Error(this.refuse!));
    this.invited.push([vendorSlug, invite]);
    return of(undefined);
  }

  override revokeStaffInvite(vendorSlug: string, inviteId: string): Observable<void> {
    this.revoked.push([vendorSlug, inviteId]);
    return of(undefined);
  }

  override moveStaffToMarket(
    vendorSlug: string,
    staffId: string,
    marketSlug: string,
  ): Observable<void> {
    this.moved.push([vendorSlug, staffId, marketSlug]);
    return of(undefined);
  }

  override removeStaff(vendorSlug: string, staffId: string): Observable<void> {
    this.removed.push([vendorSlug, staffId]);
    return of(undefined);
  }

  override inviteSummary(): Observable<VendorInviteSummary> {
    return of({ sentThisMonth: 14, linkValidDays: 14, reminderAfterDays: 5 });
  }
  override invite(invite: VendorInviteModel): Observable<VendorSummary> {
    return of({
      ...VENDORS_FIXTURE[0]!,
      slug: 'invited-vendor',
      name: invite.businessName,
      standing: 'invited',
      standingLabel: 'Invitation pending',
    });
  }
}

/** Stands in for a dialog, so the tab's own write path is what is tested. */
function answer<T>(value: T | undefined): void {
  vi.spyOn(MatDialog.prototype, 'open').mockReturnValue({
    afterClosed: () => of(value),
  } as MatDialogRef<unknown, T>);
}

/** The row for one person, and the ⋮ menu it opens. */
function rowFor(fixture: ComponentFixture<VendorStaff>, name: string): HTMLElement {
  const host = fixture.nativeElement as HTMLElement;
  const row = Array.from(host.querySelectorAll('tbody tr')).find((tr) =>
    tr.textContent?.includes(name),
  );
  expect(row).toBeTruthy();
  return row as HTMLElement;
}

/** Opens that row's ⋮ menu and returns the panel, which lives in the overlay. */
function openMenu(fixture: ComponentFixture<VendorStaff>, name: string): HTMLElement {
  rowFor(fixture, name)
    .querySelector<HTMLButtonElement>(`button[aria-label="Actions for ${name}"]`)!
    .click();
  fixture.detectChanges();
  const panel = document.querySelector<HTMLElement>('.mat-mdc-menu-panel');
  expect(panel).toBeTruthy();
  return panel!;
}

/** The menu item whose label starts with `label`. */
function menuItem(panel: HTMLElement, label: string): HTMLButtonElement {
  const item = Array.from(panel.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
    button.textContent?.trim().startsWith(label),
  );
  expect(item).toBeTruthy();
  return item!;
}

function load(slug = 'mcnally-family-farm') {
  TestBed.inject(VendorDetailFacade).load(slug);
  const fixture = TestBed.createComponent(VendorStaff);
  fixture.detectChanges();
  return fixture;
}

describe('VendorStaff', () => {
  afterEach(() => vi.restoreAllMocks());

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VendorStaff],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        VendorDetailFacade,
        { provide: VendorRepository, useClass: StubVendorRepository },
      ],
    }).compileComponents();
  });

  it('counts the seated people apart from the invitations still out', () => {
    const fixture = load();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    // Five rows, but one of them is an offer rather than a member of the team.
    expect(text).toContain('4 people, 1 invitation pending');
    expect(text).toContain('Staff sign in to the vendor app with their own account.');
  });

  it('renders a row per person, with contact details and market scope', () => {
    const fixture = load();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelectorAll('tbody tr').length).toBe(5);

    const tom = rowFor(fixture, 'Tom McNally');
    expect(tom.textContent).toContain('Owner · account holder');
    expect(tom.textContent).toContain('tom@mcnallyfarm.ie');
    expect(tom.textContent).toContain('087 244 1180');
    expect(tom.textContent).toContain('All markets');
    expect(tom.textContent).toContain('Manages staff');

    const cathal = rowFor(fixture, 'Cathal Byrne');
    expect(cathal.textContent).toContain('Temple Bar');
    expect(cathal.textContent).toContain('Marlay Park');
    expect(cathal.textContent).not.toContain('All markets');
  });

  it('marks a pending invitation and offers only what can be done to one', () => {
    const fixture = load();

    const sam = rowFor(fixture, 'Sam Okafor');
    expect(sam.textContent).toContain('Stallholder · invited 2 days ago');
    expect(sam.textContent).toContain('Invitation pending');
    expect(sam.textContent).toContain('No phone yet');
    // The face is an outline until they accept.
    expect(sam.querySelector('md-avatar')?.classList.contains('outlined')).toBe(true);

    // Nobody is seated, so there is no seat to move or remove — only the offer
    // itself to re-send or withdraw.
    const panel = openMenu(fixture, 'Sam Okafor');
    expect(panel.textContent).toContain('Send the invitation again');
    expect(panel.textContent).toContain('Withdraw invitation');
    expect(panel.textContent).not.toContain('Change market');
    expect(panel.textContent).not.toContain('Remove from vendor');
  });

  it('sends the invitation the dialog answers with', () => {
    const fixture = load();
    const repo = TestBed.inject(VendorRepository) as StubVendorRepository;
    answer<VendorStaffInvite>({ email: 'dara@example.ie', marketSlug: 'temple-bar' });

    const host = fixture.nativeElement as HTMLElement;
    const button = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(
      (candidate) => candidate.textContent?.includes('Invite staff member'),
    );
    expect(button?.disabled).toBe(false);
    button!.click();

    expect(repo.invited).toEqual([
      ['mcnally-family-farm', { email: 'dara@example.ie', marketSlug: 'temple-bar' }],
    ]);
  });

  it('says why a refused invitation did not go, in the backend’s own words', () => {
    const fixture = load();
    const repo = TestBed.inject(VendorRepository) as StubVendorRepository;
    repo.refuse = 'Too many invites sent, please try again later';
    answer<VendorStaffInvite>({ email: 'dara@example.ie', marketSlug: 'temple-bar' });

    const host = fixture.nativeElement as HTMLElement;
    Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
      .find((candidate) => candidate.textContent?.includes('Invite staff member'))!
      .click();
    fixture.detectChanges();

    expect(repo.invited).toEqual([]);
    expect(document.body.textContent).toContain('Too many invites sent');
  });

  it('re-sends a pending invitation to the address and market it already names', () => {
    const fixture = load();
    const repo = TestBed.inject(VendorRepository) as StubVendorRepository;

    menuItem(openMenu(fixture, 'Sam Okafor'), 'Send the invitation again').click();

    // No dialog: there is nothing to ask. The backend supersedes the old code.
    expect(repo.invited).toEqual([
      ['mcnally-family-farm', { email: 'sam.okafor@gmail.com', marketSlug: 'temple-bar' }],
    ]);
  });

  it('withdraws an invitation by its own id, once confirmed', () => {
    const fixture = load();
    const repo = TestBed.inject(VendorRepository) as StubVendorRepository;
    answer(true);

    menuItem(openMenu(fixture, 'Sam Okafor'), 'Withdraw invitation').click();

    expect(repo.revoked).toEqual([['mcnally-family-farm', 'inv-sam-okafor']]);
  });

  it('leaves the invitation alone when the confirmation is dismissed', () => {
    const fixture = load();
    const repo = TestBed.inject(VendorRepository) as StubVendorRepository;
    answer(undefined);

    menuItem(openMenu(fixture, 'Sam Okafor'), 'Withdraw invitation').click();

    expect(repo.revoked).toEqual([]);
  });

  it('moves a stallholder to the market the dialog picked', () => {
    const fixture = load();
    const repo = TestBed.inject(VendorRepository) as StubVendorRepository;
    answer('marlay-park');

    menuItem(openMenu(fixture, 'Cathal Byrne'), 'Change market').click();

    expect(repo.moved).toEqual([['mcnally-family-farm', 'stf-cathal-byrne', 'marlay-park']]);
  });

  it('offers the owner nothing: their seat is the way back into the business', () => {
    const fixture = load();

    // Removing the owner would leave a vendor nobody can sign in to manage —
    // refused server-side too. *Change market* is meaningless for someone who
    // spans every market, and ownership cannot be handed over at all
    // (`docs/backend-api-gaps.md` §9).
    const panel = openMenu(fixture, 'Tom McNally');
    expect(menuItem(panel, 'Change market').disabled).toBe(true);
    expect(menuItem(panel, 'Make an owner').disabled).toBe(true);
    expect(menuItem(panel, 'Remove from vendor').disabled).toBe(true);
  });

  it('removes a stallholder once confirmed', () => {
    const fixture = load();
    const repo = TestBed.inject(VendorRepository) as StubVendorRepository;
    answer(true);

    menuItem(openMenu(fixture, 'Cathal Byrne'), 'Remove from vendor').click();

    expect(repo.removed).toEqual([['mcnally-family-farm', 'stf-cathal-byrne']]);
  });

  it('scopes the table to one market, keeping people who can work anywhere', () => {
    TestBed.inject(VendorDetailFacade).load('mcnally-family-farm');
    const fixture = TestBed.createComponent(VendorStaff);
    fixture.componentRef.setInput('market', 'Marlay Park Market');
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const names = Array.from(host.querySelectorAll('tbody tr')).map((tr) =>
      tr.textContent?.split('·')[0]?.trim(),
    );
    // Both owners (all markets) plus the two stallholders scoped to Marlay Park.
    expect(names?.length).toBe(4);
    expect(host.textContent).toContain('Tom McNally');
    expect(host.textContent).toContain('Lucia Marín');
    expect(host.textContent).not.toContain('Sam Okafor');
  });

  it('keeps whoever can work anywhere in every scope', () => {
    TestBed.inject(VendorDetailFacade).load('mcnally-family-farm');
    const fixture = TestBed.createComponent(VendorStaff);
    fixture.componentRef.setInput('market', 'Howth Harbour Market');
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    // Nobody is scoped to Howth alone, but both owners can work at every market.
    expect(host.querySelectorAll('tbody tr').length).toBe(2);
    expect(host.textContent).toContain('Tom McNally');
    expect(host.textContent).toContain('Bríd McNally');
    expect(host.textContent).not.toContain('Cathal Byrne');
  });

  it('renders the notes that depend on this vendor', () => {
    const fixture = load();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Who can change this list');
    expect(text).toContain('Tom and Bríd manage staff from the vendor app.');
    expect(text).toContain('Leaving a market');
    expect(text).toContain('If the vendor drops Howth');
  });

  it('mirrors the backend roles', () => {
    expect(MCNALLY_DETAIL.staff[0]?.memberRole).toBe(VendorMemberRole.Owner);
    expect(MCNALLY_DETAIL.staff[2]?.memberRole).toBe(VendorMemberRole.Staff);
  });
});

/**
 * A vendor whose only people are scoped stallholders — no owner to fall back
 * on. Rare, but the shape real data can take once an owner leaves.
 */
class StallholdersOnlyRepository extends VendorRepository {
  /** The directory is not what these tests are about — an empty page satisfies
   *  the port. */
  override list(): Observable<VendorDirectoryPage> {
    return of({
      items: [],
      total: 0,
      facets: { markets: [], applicationCount: 0, vendorCount: 0 },
    });
  }
  override detail(): Observable<VendorDetail> {
    return of({
      ...MCNALLY_DETAIL,
      staff: MCNALLY_DETAIL.staff.filter((person) => !person.allMarkets),
    });
  }
  override profile(): Observable<VendorProfile> {
    return of(MCNALLY_PROFILE);
  }
  override saveProfile(_slug: string, patch: VendorProfilePatch): Observable<VendorProfile> {
    return of({ ...MCNALLY_PROFILE, ...patch });
  }
  override setActive(): Observable<VendorSummary> {
    return of(VENDORS_FIXTURE[0]!);
  }
  /** Not a write these screens make; present so the port is satisfied. */
  override addToMarket(): Observable<void> {
    return of(undefined);
  }

  override removeFromMarket(): Observable<void> {
    return of(undefined);
  }

  override inviteStaff(): Observable<void> {
    return of(undefined);
  }

  override revokeStaffInvite(): Observable<void> {
    return of(undefined);
  }

  override moveStaffToMarket(): Observable<void> {
    return of(undefined);
  }

  override removeStaff(): Observable<void> {
    return of(undefined);
  }

  override inviteSummary(): Observable<VendorInviteSummary> {
    return of({ sentThisMonth: 14, linkValidDays: 14, reminderAfterDays: 5 });
  }
  override invite(invite: VendorInviteModel): Observable<VendorSummary> {
    return of({
      ...VENDORS_FIXTURE[0]!,
      slug: 'invited-vendor',
      name: invite.businessName,
      standing: 'invited',
      standingLabel: 'Invitation pending',
    });
  }
}

describe('VendorStaff with nobody scoped to the chosen market', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VendorStaff],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        VendorDetailFacade,
        { provide: VendorRepository, useClass: StallholdersOnlyRepository },
      ],
    }).compileComponents();
  });

  it('explains the empty scope rather than showing a blank table', () => {
    TestBed.inject(VendorDetailFacade).load('mcnally-family-farm');
    const fixture = TestBed.createComponent(VendorStaff);
    fixture.componentRef.setInput('market', 'Howth Harbour Market');
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Nobody is scoped to that market');
    expect(text).toContain('Show all staff');
  });
});
