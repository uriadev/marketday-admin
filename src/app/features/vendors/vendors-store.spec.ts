import { TestBed } from '@angular/core/testing';
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
  VendorProfile,
  VendorProfilePatch,
  VendorSummary,
} from '../../core/models/vendor.model';
import { VendorsStore } from './vendors-store';

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

class FailingVendorRepository extends VendorRepository {
  override list(): Observable<readonly VendorSummary[]> {
    return throwError(() => new Error('The directory is unavailable.'));
  }
  override detail(): Observable<VendorDetail> {
    return throwError(() => new Error('nope'));
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

function storeWith(repo: typeof StubVendorRepository): VendorsStore {
  TestBed.configureTestingModule({
    providers: [VendorsStore, { provide: VendorRepository, useClass: repo }],
  });
  return TestBed.inject(VendorsStore);
}

describe('VendorsStore', () => {
  it('reports directory totals independently of the filters', () => {
    const store = storeWith(StubVendorRepository);
    store.load();

    expect(store.items().length).toBe(30);
    expect(store.tradingMarketCount()).toBe(7);
    expect(store.applicationCount()).toBe(4);
    expect(store.summary()).toBe('Trading across 7 markets · 4 applications waiting on a decision');

    store.setFilters({ market: 'Bantry' });
    expect(store.visible().length).toBeLessThan(30);
    // Totals still describe the whole directory.
    expect(store.items().length).toBe(30);
    expect(store.applicationCount()).toBe(4);
  });

  it('narrows by each toggle', () => {
    const store = storeWith(StubVendorRepository);
    store.load();

    store.setFilters({ applications: true });
    expect(store.visible().length).toBe(4);
    expect(store.visible().every((v) => v.appliedLabel !== null)).toBe(true);

    store.resetFilters();
    store.setFilters({ multiMarket: true });
    expect(store.visible().every((v) => v.markets.length >= 2)).toBe(true);

    store.resetFilters();
    store.setFilters({ feeUnpaid: true });
    expect(store.visible().every((v) => v.standing === 'fee-unpaid')).toBe(true);

    store.resetFilters();
    store.setFilters({ paused: true });
    expect(store.visible().every((v) => v.standing === 'paused')).toBe(true);
  });

  it('combines toggles rather than widening the result', () => {
    const store = storeWith(StubVendorRepository);
    store.load();

    store.setFilters({ applications: true, multiMarket: true });
    // Only an existing multi-market vendor who has applied for another.
    expect(store.visible().map((v) => v.slug)).toEqual(['mcnally-family-farm']);
  });

  it('searches names, trades, markets and staff', () => {
    const store = storeWith(StubVendorRepository);
    store.load();

    store.setFilters({ q: 'kish' });
    expect(store.visible().map((v) => v.slug)).toEqual(['kish-fish']);

    store.resetFilters();
    store.setFilters({ q: 'temple bar' });
    expect(store.visible().length).toBeGreaterThan(1);
    expect(store.visible().every((v) => v.markets.includes('Temple Bar'))).toBe(true);

    // The design's placeholder promises staff search.
    store.resetFilters();
    store.setFilters({ q: 'bríd' });
    expect(store.visible().map((v) => v.slug)).toEqual(['mcnally-family-farm']);
  });

  it('distinguishes a filtered-empty result from an empty directory', () => {
    const store = storeWith(StubVendorRepository);
    store.load();

    store.setFilters({ q: 'no such vendor' });
    expect(store.visible()).toEqual([]);
    expect(store.isFilteredEmpty()).toBe(true);
    expect(store.isEmpty()).toBe(false);
  });

  it('surfaces a failed load as an error', () => {
    const store = storeWith(FailingVendorRepository);
    store.load();

    expect(store.hasError()).toBe(true);
    expect(store.error()).toBe('The directory is unavailable.');
  });
});
