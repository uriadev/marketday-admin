import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
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
  /** Every switch asked for, oldest first. */
  readonly switches: { slug: string; active: boolean }[] = [];
  /** What has been switched, laid over the fixture so the next `list()` sees it. */
  private readonly switched = new Map<string, boolean>();

  private rows(): VendorSummary[] {
    return VENDORS_FIXTURE.map((vendor) => this.withSwitch(vendor));
  }

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

  override list(query: VendorListQuery): Observable<VendorDirectoryPage> {
    this.queries.push(query);
    const matched = this.rows().filter((vendor) => matchesVendorFilters(vendor, query.filters));
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
  override setActive(slug: string, active: boolean): Observable<VendorSummary> {
    this.switches.push({ slug, active });
    const vendor = VENDORS_FIXTURE.find((candidate) => candidate.slug === slug);
    if (!vendor) return throwError(() => new Error(`No vendor matches “${slug}”.`));
    this.switched.set(slug, active);
    return of(this.withSwitch(vendor));
  }
  /** Not a write these screens make; present so the port is satisfied. */
  override addToMarket(): Observable<void> {
    return of(undefined);
  }

  override removeFromMarket(): Observable<void> {
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

class FailingVendorRepository extends StubVendorRepository {
  override list(): Observable<VendorDirectoryPage> {
    return throwError(() => new Error('The directory is unavailable.'));
  }
}

/** The backend refusing a switch — a non-admin caller, say. */
class RefusingSwitchRepository extends StubVendorRepository {
  override setActive(): Observable<VendorSummary> {
    return throwError(() => new Error('forbidden'));
  }
}

/** A switch that stays in flight until the test lets it answer. */
class SlowSwitchRepository extends StubVendorRepository {
  readonly answer = new Subject<VendorSummary>();
  override setActive(slug: string, active: boolean): Observable<VendorSummary> {
    this.switches.push({ slug, active });
    return this.answer;
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

  describe('switching a vendor on or off', () => {
    it('asks the repository, then shows the row it answers with', () => {
      const repo = new StubVendorRepository();
      const store = storeWith(repo);
      store.load();
      const vendor = store.items().find((row) => row.isActive)!;
      const done = vi.fn();

      store.setActive(vendor, false, done);

      expect(repo.switches).toEqual([{ slug: vendor.slug, active: false }]);
      const shown = store.items().find((row) => row.id === vendor.id);
      expect(shown).toMatchObject({ isActive: false, standing: 'paused', standingLabel: 'Paused' });
      expect(done).toHaveBeenCalledWith(shown);
      expect(store.isPending(vendor)).toBe(false);
      expect(store.commandError()).toBeNull();
      // Nothing else on the page moved.
      expect(store.items()).toHaveLength(25);
    });

    it('does not read the page again unless the Paused filter is on', () => {
      // Switching only changes `isActive`, and only the Paused filter narrows
      // by it — the directory count and every other row are as they were.
      const repo = new StubVendorRepository();
      const store = storeWith(repo);
      store.load();
      const reads = repo.queries.length;

      store.setActive(
        store.items().find((row) => row.isActive)!,
        false,
      );

      expect(repo.queries).toHaveLength(reads);
    });

    it('reads the page again under the Paused filter, so the row leaves it', () => {
      const repo = new StubVendorRepository();
      const store = storeWith(repo);
      store.load();
      store.setFilters({ paused: true });
      const pausedBefore = store.total();
      const reads = repo.queries.length;
      const vendor = store.items()[0]!;

      store.setActive(vendor, true);

      expect(repo.queries).toHaveLength(reads + 1);
      expect(store.total()).toBe(pausedBefore - 1);
      expect(store.items().some((row) => row.id === vendor.id)).toBe(false);
    });

    it('leaves the row alone and says why when the backend refuses', () => {
      // Not optimistic: a refused change must leave the row exactly where it was.
      const store = storeWith(new RefusingSwitchRepository());
      store.load();
      const vendor = store.items().find((row) => row.isActive)!;
      const done = vi.fn();

      store.setActive(vendor, false, done);

      expect(store.items().find((row) => row.id === vendor.id)).toEqual(vendor);
      expect(store.commandError()).toBe('forbidden');
      expect(store.isPending(vendor)).toBe(false);
      expect(done).not.toHaveBeenCalled();
    });

    it('clears an earlier refusal when the next change is attempted', () => {
      const repo = new StubVendorRepository();
      const store = storeWith(repo);
      store.load();
      const vendor = store.items().find((row) => row.isActive)!;

      store.setActive({ ...vendor, slug: 'no-such-vendor' }, false);
      expect(store.commandError()).toBe('No vendor matches “no-such-vendor”.');

      store.setActive(vendor, false);
      expect(store.commandError()).toBeNull();
    });

    it('ignores a second click while the first is still in flight', () => {
      const repo = new SlowSwitchRepository();
      const store = storeWith(repo);
      store.load();
      const [first, second] = store.items();

      store.setActive(first!, false);
      store.setActive(first!, true);

      expect(repo.switches).toEqual([{ slug: first!.slug, active: false }]);
      expect(store.isPending(first!)).toBe(true);
      // Only that row waits — another can still be switched.
      expect(store.isPending(second!)).toBe(false);

      repo.answer.next({ ...first!, isActive: false, standing: 'paused', standingLabel: 'Paused' });
      expect(store.isPending(first!)).toBe(false);
    });
  });
});
