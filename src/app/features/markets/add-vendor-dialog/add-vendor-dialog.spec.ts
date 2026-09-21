import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Observable, of, throwError } from 'rxjs';
import { VendorRepository } from '../../../core/api/ports/vendor-repository';
import {
  VendorDirectoryPage,
  VendorInvite,
  VendorInviteSummary,
  VendorListQuery,
  VendorProfile,
  VendorProfilePatch,
  VendorSummary,
} from '../../../core/models/vendor.model';
import { VendorDetail } from '../../../core/models/vendor.model';
import { AddVendorDialog, AddVendorDialogData } from './add-vendor-dialog';

function vendor(overrides: Partial<VendorSummary>): VendorSummary {
  return {
    id: 'vnd',
    slug: 'a-vendor',
    name: 'A Vendor',
    meta: 'Cheese · since 2018',
    markets: [],
    appliedLabel: null,
    staff: [],
    staffCount: 1,
    isActive: true,
    standing: 'trading',
    standingLabel: 'Trading',
    ...overrides,
  };
}

const SHERIDANS = vendor({ slug: 'sheridans-cheese', name: 'Sheridans Cheese' });
const NINE_BEAN = vendor({
  slug: 'nine-bean-rows',
  name: 'Nine Bean Rows',
  meta: 'Bakery · since 2019',
  markets: ['Howth'],
});
const CLOSED = vendor({
  slug: 'coolea-cheese-co',
  name: 'Coolea Cheese Co.',
  isActive: false,
  standing: 'paused',
  standingLabel: 'Paused',
});

/** Records what was asked of the directory, and answers with a filtered page. */
class StubVendorRepository extends VendorRepository {
  readonly queries: string[] = [];
  refuse = false;

  override list(query: VendorListQuery): Observable<VendorDirectoryPage> {
    this.queries.push(query.filters.q);
    if (this.refuse) return throwError(() => new Error('Those vendors could not be loaded.'));
    const needle = query.filters.q.trim().toLowerCase();
    const items = [SHERIDANS, NINE_BEAN, CLOSED].filter(
      (candidate) => needle === '' || candidate.name.toLowerCase().includes(needle),
    );
    return of({
      items,
      total: items.length,
      facets: { markets: [], applicationCount: 0, vendorCount: 3 },
    });
  }

  override detail(): Observable<VendorDetail> {
    return of({} as VendorDetail);
  }
  override profile(): Observable<VendorProfile> {
    return of({} as VendorProfile);
  }
  override saveProfile(_slug: string, _patch: VendorProfilePatch): Observable<VendorProfile> {
    return of({} as VendorProfile);
  }
  override setActive(): Observable<VendorSummary> {
    return of(SHERIDANS);
  }
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
    return of({} as VendorInviteSummary);
  }
  override invite(_invite: VendorInvite): Observable<VendorSummary> {
    return of(SHERIDANS);
  }
}

const closed: (VendorSummary | undefined)[] = [];
const ref = { close: (picked?: VendorSummary) => closed.push(picked) };

/** Held here rather than injected: reading it would instantiate the module,
 *  and the data provider is overridden per test after that point. */
let repo: StubVendorRepository;

/**
 * The search debounces, and this app is zoneless — there is no `fakeAsync` to
 * reach for, so the clock is vitest's and every open winds it past the wait.
 */
function settle(fixture: { detectChanges(): void }) {
  vi.advanceTimersByTime(300);
  fixture.detectChanges();
}

function open(onRosterSlugs: readonly string[] = []) {
  TestBed.overrideProvider(MAT_DIALOG_DATA, {
    useValue: { marketName: 'Temple Bar Food Market', onRosterSlugs } as AddVendorDialogData,
  });
  const fixture = TestBed.createComponent(AddVendorDialog);
  fixture.detectChanges();
  settle(fixture);
  return fixture;
}

function host(fixture: { nativeElement: unknown }): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function optionNames(fixture: { nativeElement: unknown }): string[] {
  return Array.from(host(fixture).querySelectorAll('mat-list-option')).map((option) =>
    (option.querySelector('[matListItemTitle]')?.textContent ?? '').trim(),
  );
}

function search(fixture: { nativeElement: unknown; detectChanges(): void }, text: string): void {
  const input = host(fixture).querySelector('input') as HTMLInputElement;
  input.value = text;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
  settle(fixture);
}

function add(fixture: { nativeElement: unknown; detectChanges(): void }): HTMLButtonElement {
  return Array.from(host(fixture).querySelectorAll('button')).find((button) =>
    button.textContent?.includes('Add to market'),
  ) as HTMLButtonElement;
}

describe('AddVendorDialog', () => {
  beforeEach(async () => {
    closed.length = 0;
    repo = new StubVendorRepository();
    vi.useFakeTimers();
    await TestBed.configureTestingModule({
      imports: [AddVendorDialog],
      providers: [
        provideNoopAnimations(),
        { provide: VendorRepository, useValue: repo },
        { provide: MatDialogRef, useValue: ref },
        { provide: MAT_DIALOG_DATA, useValue: {} },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens on a page of the directory, without waiting to be searched', () => {
    const fixture = open();

    expect(optionNames(fixture)).toEqual([
      'Sheridans Cheese',
      'Nine Bean Rows',
      'Coolea Cheese Co. Paused',
    ]);
  });

  it('leaves out vendors already on this market’s roster', () => {
    // Offering one would promise something `joinMarket` would not do.
    const fixture = open(['sheridans-cheese', 'coolea-cheese-co']);

    expect(optionNames(fixture)).toEqual(['Nine Bean Rows']);
  });

  it('pushes the search to the directory rather than filtering the page', () => {
    const fixture = open();

    search(fixture, 'bean');

    expect(repo.queries).toEqual(['', 'bean']);
    expect(optionNames(fixture)).toEqual(['Nine Bean Rows']);
  });

  it('says why the list is empty, in the words that fit the reason', () => {
    const everyone = open(['sheridans-cheese', 'nine-bean-rows', 'coolea-cheese-co']);
    expect(host(everyone).textContent).toContain('already trades here');

    search(everyone, 'nobody');
    expect(host(everyone).textContent).toContain('No other vendor matches “nobody”');
  });

  it('offers a deactivated vendor, saying so — it is usually a market being set up', () => {
    const fixture = open();

    expect(optionNames(fixture)).toContain('Coolea Cheese Co. Paused');
  });

  it('answers with the vendor that was picked, and only once one is', () => {
    const fixture = open();
    expect(add(fixture).disabled).toBe(true);

    (host(fixture).querySelectorAll('mat-list-option')[1] as HTMLElement).click();
    fixture.detectChanges();
    add(fixture).click();

    expect(closed).toEqual([NINE_BEAN]);
  });

  it('shows a refusal instead of an empty list, and stays closed', () => {
    repo.refuse = true;

    const fixture = open();

    expect(host(fixture).textContent).toContain('Those vendors could not be loaded.');
    expect(closed).toEqual([]);
  });
});
