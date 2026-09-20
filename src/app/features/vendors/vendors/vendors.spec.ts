import { ComponentFixture, TestBed } from '@angular/core/testing';
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
  VendorListQuery,
  VendorProfile,
  VendorProfilePatch,
  VendorSummary,
  matchesVendorFilters,
} from '../../../core/models/vendor.model';
import { pageOf } from '../../../core/models/page.model';
import { Notifications } from '../../../core/notifications/notifications';
import { ConsoleChrome } from '../../../layouts/console-layout/console-chrome';
import { Vendors } from './vendors';
import { VendorsStore } from '../vendors-store';

class StubVendorRepository extends VendorRepository {
  /** What has been switched, laid over the fixture so the next `list()` sees it. */
  private readonly switched = new Map<string, boolean>();

  private withSwitch(vendor: VendorSummary): VendorSummary {
    const active = this.switched.get(vendor.slug);
    if (active === undefined) return vendor;
    return {
      ...vendor,
      isActive: active,
      standing: active ? 'trading' : 'paused',
      standingLabel: active ? 'Trading' : 'Paused',
    };
  }

  /** Pages the fixture the way `adminVendors` does — the screen only ever
   *  holds the page it asked for. */
  override list(query: VendorListQuery): Observable<VendorDirectoryPage> {
    const matched = VENDORS_FIXTURE.map((vendor) => this.withSwitch(vendor)).filter((vendor) =>
      matchesVendorFilters(vendor, query.filters),
    );
    return of({
      ...pageOf(matched, query.page),
      facets: {
        markets: [...new Set(VENDORS_FIXTURE.flatMap((vendor) => vendor.markets))].sort((a, b) =>
          a.localeCompare(b),
        ),
        applicationCount: VENDORS_FIXTURE.filter((vendor) => vendor.appliedLabel !== null).length,
        vendorCount: VENDORS_FIXTURE.length,
      },
    });
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
  /** Answers as the backend does: the row, as stored, in its new state. */
  override setActive(slug: string, active: boolean): Observable<VendorSummary> {
    const vendor = VENDORS_FIXTURE.find((candidate) => candidate.slug === slug)!;
    this.switched.set(slug, active);
    return of(this.withSwitch(vendor));
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

/** A backend that refuses every switch — a non-admin caller, say. */
class RefusingSwitchRepository extends StubVendorRepository {
  override setActive(): Observable<VendorSummary> {
    return throwError(() => new Error('forbidden'));
  }
}

describe('Vendors', () => {
  /** The row for a vendor. */
  function rowOf(host: HTMLElement, name: string): HTMLElement {
    return Array.from(host.querySelectorAll<HTMLElement>('tbody tr')).find((tr) =>
      tr.textContent?.includes(name),
    )!;
  }

  /** Opens a row's ⋮ menu, which renders in an overlay on the document. */
  function openRowMenu(fixture: ComponentFixture<Vendors>, name: string): void {
    const row = rowOf(fixture.nativeElement, name);
    row.querySelector<HTMLButtonElement>(`button[aria-label="Actions for ${name}"]`)!.click();
    fixture.detectChanges();
  }

  /** The open menu's items, by what they say. */
  function menuItems(): string[] {
    return Array.from(
      document.querySelectorAll('button.mat-mdc-menu-item, a.mat-mdc-menu-item'),
    ).map((item) => item.textContent?.trim() ?? '');
  }

  function menuItem(label: string): HTMLButtonElement {
    const match = Array.from(document.querySelectorAll('button.mat-mdc-menu-item')).find(
      (item) => item.textContent?.trim() === label,
    );
    expect(match, `a “${label}” menu item`).toBeDefined();
    return match as HTMLButtonElement;
  }

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

  it('keeps activating a vendor in the row menu, not in a column of its own', () => {
    const fixture = TestBed.createComponent(Vendors);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('mat-slide-toggle')).toBeNull();
    expect(host.querySelector('th.mat-column-active')).toBeNull();
  });

  it('offers Deactivate for an active vendor and Activate for a paused one', () => {
    const fixture = TestBed.createComponent(Vendors);
    fixture.detectChanges();

    openRowMenu(fixture, 'McNally Family Farm');
    expect(menuItems()).toContain('Deactivate vendor');
    expect(menuItems()).not.toContain('Activate vendor');
  });

  it('offers Activate on a row the Paused filter is showing', () => {
    const fixture = TestBed.createComponent(Vendors);
    fixture.componentRef.setInput('paused', 'true');
    fixture.detectChanges();
    const name = fixture.nativeElement.querySelector('.vendor-name').textContent.trim();

    openRowMenu(fixture, name);

    expect(menuItems()).toContain('Activate vendor');
    expect(menuItems()).not.toContain('Deactivate vendor');
  });

  it('deactivates a vendor from its menu and says so', () => {
    const fixture = TestBed.createComponent(Vendors);
    const success = vi.spyOn(TestBed.inject(Notifications), 'success');
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    openRowMenu(fixture, 'McNally Family Farm');
    menuItem('Deactivate vendor').click();
    fixture.detectChanges();

    // The pill follows the same row the server answered with.
    expect(rowOf(host, 'McNally Family Farm').textContent).toContain('Paused');
    expect(success).toHaveBeenCalledWith('McNally Family Farm is now inactive.');
  });

  it('reactivates it from the same menu, which now says Activate', async () => {
    const fixture = TestBed.createComponent(Vendors);
    const success = vi.spyOn(TestBed.inject(Notifications), 'success');
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    openRowMenu(fixture, 'McNally Family Farm');
    menuItem('Deactivate vendor').click();
    fixture.detectChanges();
    await fixture.whenStable();

    openRowMenu(fixture, 'McNally Family Farm');
    menuItem('Activate vendor').click();
    fixture.detectChanges();

    expect(rowOf(host, 'McNally Family Farm').textContent).toContain('Trading');
    expect(success).toHaveBeenLastCalledWith('McNally Family Farm is now active.');
  });

  it('drops a vendor from the Paused list once it is activated', () => {
    // The filter is on, so the row no longer matches the moment it is active —
    // the store reads the page again and it leaves.
    const fixture = TestBed.createComponent(Vendors);
    const success = vi.spyOn(TestBed.inject(Notifications), 'success');
    fixture.componentRef.setInput('paused', 'true');
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const name = host.querySelector('.vendor-name')!.textContent!.trim();

    openRowMenu(fixture, name);
    menuItem('Activate vendor').click();
    fixture.detectChanges();

    expect(
      Array.from(host.querySelectorAll('.vendor-name')).map((a) => a.textContent?.trim()),
    ).not.toContain(name);
    expect(success).toHaveBeenCalledWith(`${name} is now active.`);
  });

  it('leaves the row as it was when the change is refused, and says why', () => {
    TestBed.overrideProvider(VendorRepository, { useValue: new RefusingSwitchRepository() });
    const fixture = TestBed.createComponent(Vendors);
    const success = vi.spyOn(TestBed.inject(Notifications), 'success');
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    openRowMenu(fixture, 'McNally Family Farm');
    menuItem('Deactivate vendor').click();
    fixture.detectChanges();

    expect(rowOf(host, 'McNally Family Farm').textContent).toContain('Trading');
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('forbidden');
    expect(success).not.toHaveBeenCalled();
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
