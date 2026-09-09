import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { VendorRepository } from '../../core/api/ports/vendor-repository';
import {
  MCNALLY_DETAIL,
  MCNALLY_PROFILE,
  VENDORS_FIXTURE,
} from '../../core/api/in-memory/in-memory-vendor-repository';
import { pageOf } from '../../core/models/page.model';
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
} from '../../core/models/vendor.model';
import { VendorsStore } from './vendors-store';

/**
 * A repository that pages the fixture the way a server would, and keeps every
 * query it was asked — the store's job is now to *ask* for the right page, so
 * the requests matter as much as the rows that come back.
 */
class StubVendorRepository extends VendorRepository {
  readonly queries: VendorListQuery[] = [];

  override list(query: VendorListQuery): Observable<VendorDirectoryPage> {
    this.queries.push(query);
    const matched = VENDORS_FIXTURE.filter((vendor) => matchesVendorFilters(vendor, query.filters));
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

class FailingVendorRepository extends StubVendorRepository {
  override list(): Observable<VendorDirectoryPage> {
    return throwError(() => new Error('The directory is unavailable.'));
  }
}

function storeWith(repo: VendorRepository): VendorsStore {
  TestBed.configureTestingModule({
    providers: [VendorsStore, { provide: VendorRepository, useValue: repo }],
  });
  return TestBed.inject(VendorsStore);
}

describe('VendorsStore', () => {
  it('reports directory totals independently of the filters', () => {
    const store = storeWith(new StubVendorRepository());
    store.load();

    expect(store.vendorCount()).toBe(30);
    expect(store.total()).toBe(30);
    expect(store.tradingMarketCount()).toBe(7);
    expect(store.applicationCount()).toBe(4);
    expect(store.summary()).toBe('Trading across 7 markets · 4 applications waiting on a decision');

    store.setFilters({ market: 'Bantry' });
    expect(store.total()).toBeLessThan(30);
    // Totals still describe the whole directory.
    expect(store.vendorCount()).toBe(30);
    expect(store.applicationCount()).toBe(4);
  });

  it('holds one page, not the collection', () => {
    const store = storeWith(new StubVendorRepository());
    store.load();

    expect(store.items().length).toBe(25);
    expect(store.total()).toBe(30);
    expect(store.pageIndex()).toBe(0);
  });

  it('asks the repository for the page it is showing', () => {
    const repo = new StubVendorRepository();
    const store = storeWith(repo);
    store.load();

    store.setPage(1, 25);
    expect(repo.queries.at(-1)?.page).toEqual({ index: 1, size: 25 });
    expect(store.items().length).toBe(5);

    // A page size is a new request too, not a re-slice of what is in hand.
    store.setPage(0, 10);
    expect(repo.queries.at(-1)?.page).toEqual({ index: 0, size: 10 });
    expect(store.items().length).toBe(10);
  });

  it('goes back to the first page when the filters change', () => {
    const repo = new StubVendorRepository();
    const store = storeWith(repo);
    store.load();

    store.setPage(1, 25);
    store.setFilters({ applications: true });

    expect(store.pageIndex()).toBe(0);
    expect(repo.queries.at(-1)?.page).toEqual({ index: 0, size: 25 });
    expect(store.total()).toBe(4);
  });

  it('sends the filters to the repository rather than narrowing the page', () => {
    const repo = new StubVendorRepository();
    const store = storeWith(repo);
    store.load();

    store.setFilters({ q: 'kish' });
    expect(repo.queries.at(-1)?.filters.q).toBe('kish');
    expect(store.items().map((v) => v.slug)).toEqual(['kish-fish']);
  });

  it('narrows by each toggle', () => {
    const store = storeWith(new StubVendorRepository());
    store.load();

    store.setFilters({ applications: true });
    expect(store.total()).toBe(4);
    expect(store.items().every((v) => v.appliedLabel !== null)).toBe(true);

    store.resetFilters();
    store.setFilters({ multiMarket: true });
    expect(store.items().every((v) => v.markets.length >= 2)).toBe(true);

    store.resetFilters();
    store.setFilters({ feeUnpaid: true });
    expect(store.items().every((v) => v.standing === 'fee-unpaid')).toBe(true);

    store.resetFilters();
    store.setFilters({ paused: true });
    expect(store.items().every((v) => v.standing === 'paused')).toBe(true);
  });

  it('combines toggles rather than widening the result', () => {
    const store = storeWith(new StubVendorRepository());
    store.load();

    store.setFilters({ applications: true, multiMarket: true });
    // Only an existing multi-market vendor who has applied for another.
    expect(store.items().map((v) => v.slug)).toEqual(['mcnally-family-farm']);
  });

  it('distinguishes a filtered-empty result from an empty directory', () => {
    const store = storeWith(new StubVendorRepository());
    store.load();

    store.setFilters({ q: 'no such vendor' });
    expect(store.items()).toEqual([]);
    expect(store.isFilteredEmpty()).toBe(true);
    // Nothing matched, but there is a directory behind it — which is what
    // makes "clear the filters" the way out rather than "invite a vendor".
    expect(store.vendorCount()).toBe(30);
  });

  it('surfaces a failed load as an error', () => {
    const store = storeWith(new FailingVendorRepository());
    store.load();

    expect(store.hasError()).toBe(true);
    expect(store.error()).toBe('The directory is unavailable.');
  });
});
