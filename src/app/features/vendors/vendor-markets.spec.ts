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
  VendorDetail as VendorDetailModel,
  VendorInvite as VendorInviteModel,
  VendorInviteSummary,
  VendorProfile,
  VendorProfilePatch,
  VendorSummary,
} from '../../core/models/vendor.model';
import { VendorDetail } from './vendor-detail';
import { VendorDetailFacade } from './vendor-detail-facade';
import { VendorMarkets } from './vendor-markets';

class StubVendorRepository extends VendorRepository {
  override list(): Observable<readonly VendorSummary[]> {
    return of(VENDORS_FIXTURE);
  }
  override detail(slug: string): Observable<VendorDetailModel> {
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

function configure(component: unknown) {
  return TestBed.configureTestingModule({
    imports: [component as never],
    providers: [
      provideRouter([]),
      provideNoopAnimations(),
      VendorDetailFacade,
      { provide: VendorRepository, useClass: StubVendorRepository },
    ],
  }).compileComponents();
}

describe('VendorDetail shell', () => {
  beforeEach(() => configure(VendorDetail));

  it('renders the vendor’s identity strip and its badges', () => {
    const fixture = TestBed.createComponent(VendorDetail);
    fixture.componentRef.setInput('slug', 'mcnally-family-farm');
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('McNally Family Farm');
    expect(text).toContain('Trading at 3 markets');
    expect(text).toContain('1 application');
    expect(text).toContain('Ballyboughal, Co. Dublin');
  });

  it('shows the tab bar with every built tab enabled', () => {
    const fixture = TestBed.createComponent(VendorDetail);
    fixture.componentRef.setInput('slug', 'mcnally-family-farm');
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const tabs = Array.from(host.querySelectorAll('[mat-tab-link]'));
    // Counts stripped: whether one renders as a matBadge or plain text is the
    // tab bar's business, not this test's.
    const labels = tabs.map((tab) =>
      tab.textContent?.replace(/\d+/g, '').replace(/\s+/g, ' ').trim(),
    );
    expect(labels).toEqual([
      'Profile',
      'Markets',
      'Staff',
      'Products',
      'Payments',
      'Documents',
      'Activity',
    ]);
    expect(tabs[1]?.textContent).toContain('4');
    expect(tabs[2]?.textContent).toContain('5');
    expect(tabs[3]?.textContent).toContain('14');
    // Documents is the last tab still to come.
    expect(tabs.filter((tab) => tab.getAttribute('aria-disabled') === 'true').length).toBe(1);
  });

  it('explains a vendor that does not exist', () => {
    const fixture = TestBed.createComponent(VendorDetail);
    fixture.componentRef.setInput('slug', 'not-a-vendor');
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('No vendor matches “not-a-vendor”.');
    expect(host.querySelector('[mat-tab-link]')).toBeNull();
  });
});

describe('VendorMarkets tab', () => {
  beforeEach(() => configure(VendorMarkets));

  it('renders the waiting application above the memberships', () => {
    TestBed.inject(VendorDetailFacade).load('mcnally-family-farm');

    const fixture = TestBed.createComponent(VendorMarkets);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Applied to Douglas Village Market');
    expect(text).toContain('Wants a 3m pitch with power');
    expect(text).toContain('View application');
    expect(text).toContain('Approve');
  });

  it('renders one card per membership, each with its own status', () => {
    TestBed.inject(VendorDetailFacade).load('mcnally-family-farm');

    const fixture = TestBed.createComponent(VendorMarkets);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const cards = Array.from(host.querySelectorAll('mat-card'));
    expect(cards.length).toBe(3);

    const marlay = cards.find((card) => card.textContent?.includes('Marlay Park Market'));
    expect(marlay?.textContent).toContain('Trading');
    expect(marlay?.textContent).toContain('Fee due');
    expect(marlay?.textContent).toContain('€35 due 20 Aug');
    expect(marlay?.textContent).toContain('Stall 12 · member since June 2024');

    const howth = cards.find((card) => card.textContent?.includes('Howth Harbour Market'));
    expect(howth?.textContent).toContain('Paused for August');
    expect(howth?.textContent).toContain('No fee while paused');

    // Each membership links through to the market's own screens.
    expect(host.querySelector('a[href="/markets/marlay-park"]')).not.toBeNull();
  });

  it('renders the rail: stats, next days, documents and the suspend card', () => {
    TestBed.inject(VendorDetailFacade).load('mcnally-family-farm');

    const fixture = TestBed.createComponent(VendorMarkets);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Across all markets');
    expect(text).toContain('Days booked');
    expect(text).toContain('Sat 22 Aug · Temple Bar A7');
    expect(text).toContain('Setup 06:30 · Bríd and Cathal on the stall');
    expect(text).toContain('Organic cert · renews 30 Sep');
    expect(text).toContain('Suspend vendor');
    expect(text).toContain('Removes them from all 3 markets and signs out all 5 staff accounts.');
  });
});
