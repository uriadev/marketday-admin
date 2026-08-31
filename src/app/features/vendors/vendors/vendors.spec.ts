import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Observable, of } from 'rxjs';
import { VendorRepository } from '../../../core/api/ports/vendor-repository';
import {
  MCNALLY_DETAIL,
  MCNALLY_PROFILE,
  VENDORS_FIXTURE,
} from '../../../core/api/in-memory/in-memory-vendor-repository';
import {
  VendorDetail,
  VendorInvite as VendorInviteModel,
  VendorInviteSummary,
  VendorProfile,
  VendorProfilePatch,
  VendorSummary,
} from '../../../core/models/vendor.model';
import { ConsoleChrome } from '../../../layouts/console-layout/console-chrome';
import { Vendors } from './vendors';
import { VendorsStore } from '../vendors-store';

class StubVendorRepository extends VendorRepository {
  override list(): Observable<readonly VendorSummary[]> {
    return of(VENDORS_FIXTURE);
  }
  override detail(): Observable<VendorDetail> {
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

describe('Vendors', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Vendors],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        ConsoleChrome,
        VendorsStore,
        { provide: VendorRepository, useClass: StubVendorRepository },
      ],
    }).compileComponents();
  });

  it('renders the directory with the design’s summary line', () => {
    const fixture = TestBed.createComponent(Vendors);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('30 vendors');
    expect(text).toContain('Trading across 7 markets · 4 applications waiting on a decision');
    expect(text).toContain('McNally Family Farm');
    expect(text).toContain('Vegetables & eggs · since 2021');
  });

  it('shows one row per vendor, not per stall pitch', () => {
    const fixture = TestBed.createComponent(Vendors);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    // McNally trades at three markets and appears once, with its markets as chips.
    const names = Array.from(host.querySelectorAll('.vendor-name')).map((a) =>
      a.textContent?.trim(),
    );
    expect(names.filter((name) => name === 'McNally Family Farm').length).toBe(1);

    const row = Array.from(host.querySelectorAll('tr')).find((tr) =>
      tr.textContent?.includes('McNally Family Farm'),
    );
    expect(row?.textContent).toContain('Temple Bar');
    expect(row?.textContent).toContain('Marlay Park');
    expect(row?.textContent).toContain('Howth');
    expect(row?.textContent).toContain('+1 applied');
    expect(row?.textContent).toContain('5 staff');
    expect(row?.textContent).toContain('Trading');
  });

  it('pages the table at 25 rows', () => {
    const fixture = TestBed.createComponent(Vendors);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    // One header row plus 25 body rows.
    expect(host.querySelectorAll('tbody tr').length).toBe(25);
    expect(host.querySelector('mat-paginator')?.textContent).toContain('1 – 25 of 30');
  });

  it('offers a Review action for a pending vendor instead of a status badge', () => {
    const fixture = TestBed.createComponent(Vendors);
    fixture.componentRef.setInput('applications', 'true');
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const pending = Array.from(host.querySelectorAll('tbody tr')).find((tr) =>
      tr.textContent?.includes('Nine Bean Rows'),
    );
    expect(pending?.textContent).toContain('Review');
    expect(pending?.textContent).toContain('Temple Bar · applied');
  });

  it('narrows the table when the URL carries a filter', () => {
    const fixture = TestBed.createComponent(Vendors);
    fixture.componentRef.setInput('feeUnpaid', 'true');
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const rows = Array.from(host.querySelectorAll('tbody tr'));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((tr) => tr.textContent?.includes('Fee unpaid'))).toBe(true);
    // The header still counts the whole directory.
    expect(host.textContent).toContain('30 vendors');
  });

  it('offers a way out when the filters match nothing', () => {
    const fixture = TestBed.createComponent(Vendors);
    fixture.componentRef.setInput('q', 'no such vendor');
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('No vendors match those filters');
    expect(text).toContain('Clear filters');
  });
});
