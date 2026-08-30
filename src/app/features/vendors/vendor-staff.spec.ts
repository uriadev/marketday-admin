import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Observable, of, throwError } from 'rxjs';
import { VendorRepository } from '../../core/api/ports/vendor-repository';
import {
  MCNALLY_DETAIL,
  MCNALLY_PROFILE,
  VENDORS_FIXTURE,
} from '../../core/api/in-memory/in-memory-vendor-repository';
import {
  VendorDetail,
  VendorInvite as VendorInviteModel,
  VendorInviteSummary,
  VendorMemberRole,
  VendorProfile,
  VendorProfilePatch,
  VendorSummary,
} from '../../core/models/vendor.model';
import { VendorDetailFacade } from './vendor-detail-facade';
import { VendorStaff } from './vendor-staff';

class StubVendorRepository extends VendorRepository {
  override list(): Observable<readonly VendorSummary[]> {
    return of(VENDORS_FIXTURE);
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

function load(slug = 'mcnally-family-farm') {
  TestBed.inject(VendorDetailFacade).load(slug);
  const fixture = TestBed.createComponent(VendorStaff);
  fixture.detectChanges();
  return fixture;
}

describe('VendorStaff', () => {
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

  it('counts the people and the invitations that haven’t landed yet', () => {
    const fixture = load();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('5 people, 1 invitation pending');
    expect(text).toContain('Staff sign in to the vendor app with their own account.');
  });

  it('renders a row per person, with contact details and market scope', () => {
    const fixture = load();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelectorAll('tbody tr').length).toBe(5);

    const rows = Array.from(host.querySelectorAll('tbody tr'));
    const tom = rows.find((tr) => tr.textContent?.includes('Tom McNally'));
    expect(tom?.textContent).toContain('Owner · account holder');
    expect(tom?.textContent).toContain('tom@mcnallyfarm.ie');
    expect(tom?.textContent).toContain('087 244 1180');
    expect(tom?.textContent).toContain('All markets');
    expect(tom?.textContent).toContain('Manages staff');

    const cathal = rows.find((tr) => tr.textContent?.includes('Cathal Byrne'));
    // A stallholder is scoped to named markets and can be given another.
    expect(cathal?.textContent).toContain('Temple Bar');
    expect(cathal?.textContent).toContain('Marlay Park');
    expect(cathal?.textContent).toContain('Add market');
    expect(cathal?.textContent).not.toContain('All markets');
  });

  it('marks a pending invitation and offers resend or cancel instead of Add market', () => {
    const fixture = load();
    const host = fixture.nativeElement as HTMLElement;

    const sam = Array.from(host.querySelectorAll('tbody tr')).find((tr) =>
      tr.textContent?.includes('Sam Okafor'),
    );
    expect(sam?.textContent).toContain('Stallholder · invited 2 days ago');
    expect(sam?.textContent).toContain('Invitation pending');
    expect(sam?.textContent).toContain('No phone yet');
    expect(sam?.textContent).toContain('Resend');
    expect(sam?.textContent).toContain('Cancel invite');
    expect(sam?.textContent).not.toContain('Add market');
    // The face is an outline until they accept.
    expect(sam?.querySelector('md-avatar')?.classList.contains('outlined')).toBe(true);
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
  override list(): Observable<readonly VendorSummary[]> {
    return of(VENDORS_FIXTURE);
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
