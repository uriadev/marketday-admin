import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Observable, of, throwError } from 'rxjs';
import { AuthRepository } from '../../../core/api/ports/auth-repository';
import { InMemoryAuthRepository } from '../../../core/api/in-memory/in-memory-auth-repository';
import { SESSION_STORAGE } from '../../../core/auth/session-storage';
import { MarketRepository } from '../../../core/api/ports/market-repository';
import { buildMarketStallPlan } from '../../../core/api/in-memory/in-memory-market-repository';
import { VendorRepository } from '../../../core/api/ports/vendor-repository';
import {
  MARKETS_FIXTURE,
  MARKET_SCHEDULES,
  MARKET_SETTINGS,
} from '../../../core/api/in-memory/market-fixture';
import {
  MCNALLY_DETAIL,
  MCNALLY_PROFILE,
  VENDORS_FIXTURE,
} from '../../../core/api/in-memory/in-memory-vendor-repository';
import { IRISH_COUNTIES } from '../../../core/models/location.model';
import {
  MarketDetail,
  MarketDraft,
  MarketRoster,
  MarketSchedulePatch,
  MarketSettingsPatch,
  MarketStallPlan,
  MarketSummary,
} from '../../../core/models/market.model';
import {
  VendorDetail,
  VendorDirectoryPage,
  VendorInvite as VendorInviteModel,
  VendorInviteSummary,
  VendorProfile,
  VendorProfilePatch,
  VendorSummary,
} from '../../../core/models/vendor.model';
import { VendorInvite } from './vendor-invite';

/** Markets are only read here, so a synchronous list is the whole stub. */
class StubMarketRepository extends MarketRepository {
  override list(): Observable<readonly MarketSummary[]> {
    return of(MARKETS_FIXTURE);
  }
  override detail(): Observable<MarketDetail> {
    return of({} as MarketDetail);
  }
  override roster(): Observable<MarketRoster> {
    return of({ vendors: [], applications: [], feesOutstanding: 0 });
  }
  override schedule(slug: string): Observable<MarketSchedulePatch> {
    return of(MARKET_SCHEDULES[slug]);
  }
  override saveSchedule(
    _slug: string,
    patch: MarketSchedulePatch,
  ): Observable<MarketSchedulePatch> {
    return of(patch);
  }
  override settings(slug: string): Observable<MarketSettingsPatch> {
    return of(MARKET_SETTINGS[slug]);
  }
  override saveSettings(
    _slug: string,
    patch: MarketSettingsPatch,
  ): Observable<MarketSettingsPatch> {
    return of(patch);
  }
  override stallPlan(slug: string): Observable<MarketStallPlan> {
    return of(buildMarketStallPlan(slug) ?? []);
  }
  override saveStallPlan(_slug: string, plan: MarketStallPlan): Observable<MarketStallPlan> {
    return of(plan);
  }
  override counties(): Observable<readonly string[]> {
    return of(IRISH_COUNTIES);
  }
  /** Not a screen this stub stands in for. */
  override draft(slug: string): Observable<MarketDraft> {
    return throwError(() => new Error(`No market matches “${slug}”.`));
  }
  override saveDraft(draft: MarketDraft): Observable<MarketSummary> {
    return of({ ...MARKETS_FIXTURE[0]!, slug: draft.slug, name: draft.name });
  }
  override publish(draft: MarketDraft): Observable<MarketSummary> {
    return of({ ...MARKETS_FIXTURE[0]!, slug: draft.slug, name: draft.name });
  }
}

/** Records what was sent, and answers synchronously. */
class StubVendorRepository extends VendorRepository {
  sent: VendorInviteModel | undefined;
  refuse = false;
  addedSoFar = 14;

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
    return of(MCNALLY_DETAIL);
  }
  override profile(): Observable<VendorProfile> {
    return of(MCNALLY_PROFILE);
  }
  override saveProfile(_slug: string, patch: VendorProfilePatch): Observable<VendorProfile> {
    return of({ ...MCNALLY_PROFILE, ...patch });
  }
  override inviteSummary(): Observable<VendorInviteSummary> {
    return of({ sentThisMonth: this.addedSoFar, linkValidDays: 14, reminderAfterDays: 5 });
  }
  override invite(invite: VendorInviteModel): Observable<VendorSummary> {
    if (this.refuse) {
      return throwError(() => new Error(`${invite.businessName} is already on MarketDay.`));
    }
    this.sent = invite;
    return of({
      id: 'vnd-coolea-cheese-co',
      slug: 'coolea-cheese-co',
      name: invite.businessName,
      meta: `${invite.trade} · invited just now`,
      markets: [],
      appliedLabel: null,
      staff: [invite.contactName],
      staffCount: 1,
      standing: 'invited',
      standingLabel: 'Invitation pending',
    });
  }
}

/** The screen signs the email with the admin's name, so `AuthStore` needs both
 *  of its dependencies even though nothing here signs in. */
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => map.delete(k),
    setItem: (k, v) => void map.set(k, v),
  } as Storage;
}

describe('VendorInvite', () => {
  let vendors: StubVendorRepository;

  beforeEach(async () => {
    vendors = new StubVendorRepository();
    await TestBed.configureTestingModule({
      imports: [VendorInvite],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        { provide: MarketRepository, useClass: StubMarketRepository },
        { provide: VendorRepository, useValue: vendors },
        { provide: AuthRepository, useClass: InMemoryAuthRepository },
        { provide: SESSION_STORAGE, useValue: memoryStorage() },
      ],
    }).compileComponents();
  });

  function open(market?: string) {
    const fixture = TestBed.createComponent(VendorInvite);
    if (market !== undefined) fixture.componentRef.setInput('market', market);
    fixture.detectChanges();
    return fixture;
  }

  function fill(fixture: ReturnType<typeof open>) {
    fixture.componentInstance['form'].patchValue({
      businessName: 'Coolea Cheese Co.',
      contactName: 'Dervla Ó Súilleabháin',
      email: 'dervla@cooleacheese.ie',
      trade: 'Cheese & dairy',
    });
    fixture.detectChanges();
  }

  /** The input under a `mat-form-field` whose label starts with `label`. */
  function field(fixture: ReturnType<typeof open>, label: string): HTMLInputElement {
    const host = fixture.nativeElement as HTMLElement;
    const match = Array.from(host.querySelectorAll('mat-form-field')).find((wrapper) =>
      wrapper.querySelector('mat-label')?.textContent?.trim().startsWith(label),
    );
    expect(match).toBeDefined();
    const input = match!.querySelector('input, textarea');
    expect(input).not.toBeNull();
    return input as HTMLInputElement;
  }

  it('renders the form and the running count of what it added', () => {
    const fixture = open();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Invite a vendor');
    expect(text).toContain('This adds the business to the directory now.');
    expect(text).toContain('14 vendors added this session');
  });

  it('hides the count until this visit has added something', () => {
    vendors.addedSoFar = 0;

    const text = (open().nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('added this session');
  });

  it('says the record and its owner land, but the email does not', () => {
    // `createVendor` is the whole of what the backend can do here
    // (docs/backend-api-gaps.md #9). The screen may not imply otherwise.
    const text = (open().nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('become the business’s owner account');
    expect(text).toContain('Their MarketDay account, or a new one. Nothing is emailed yet.');
    expect(text).toContain('Not sent today.');
    expect(text).toContain('The business is created and appears in the directory');
    expect(text).toContain('There is no approval step yet');
    expect(text).toContain('The owner’s account is created at the same time, without a password.');
    expect(text).toContain('Create vendor');
  });

  it('disables the review toggle, since nothing server-side can carry it', () => {
    // The vendor-wide `isAcceptingOrders` it rode on is gone, and a per-market
    // pause clears itself after one market day — no stand-in for "not approved
    // yet" (docs/backend-api-gaps.md #9). So every vendor is created trading.
    const fixture = open();

    expect(fixture.componentInstance['form'].controls.skipApplicationReview.disabled).toBe(true);
    expect(fixture.componentInstance['standing']).toEqual({ label: 'Trading', tone: 'positive' });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Trading');
    expect(text).toContain('takes pre-orders from 48 hours before its market day opens');
  });

  it('offers no role to choose — the named owner is the only seat', () => {
    const fixture = open();

    expect(fixture.componentInstance['form'].contains('role')).toBe(false);
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Stallholder');
  });

  it('offers every market to the autocomplete, and narrows it as you type', () => {
    const fixture = open();
    const component = fixture.componentInstance;

    expect(component['marketOptions']()).toHaveLength(7);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('All 7 markets');

    component['marketQuery'].set('bantry');
    expect(component['marketOptions']().map((market) => market.slug)).toEqual(['bantry-friday']);
  });

  it('chips what has been picked, and stops offering it again', () => {
    const fixture = open();
    const component = fixture.componentInstance;

    component['addMarket']('temple-bar');
    fixture.detectChanges();

    expect(component['selectedMarketRows']().map((market) => market.name)).toEqual([
      'Temple Bar Food Market',
    ]);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Temple Bar Food Market');
    expect(component['marketOptions']().map((market) => market.slug)).not.toContain('temple-bar');

    // Picking the same market twice is a no-op, not a duplicate chip.
    component['addMarket']('temple-bar');
    expect(component['selectedMarkets']()).toEqual(['temple-bar']);

    component['removeMarket']('temple-bar');
    fixture.detectChanges();
    expect(component['selectedMarkets']()).toEqual([]);
    expect(component['marketOptions']().map((market) => market.slug)).toContain('temple-bar');
  });

  it('builds the email preview from what has been typed', () => {
    const fixture = open();
    fill(fixture);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('To dervla@cooleacheese.ie');
    expect(text).toContain('invited Coolea Cheese Co. to MarketDay');
    expect(text).toContain('Set up your account');
    expect(text).toContain('Link expires');
  });

  it('greys out the phone and the note, which nothing carries', () => {
    // `CreateVendorInput` has no phone field and no endpoint emails the note
    // (docs/backend-api-gaps.md #9), so neither is collected — a field that
    // takes what is typed and drops it is the thing to avoid here.
    const fixture = open();

    expect(field(fixture, 'Phone').disabled).toBe(true);
    expect(field(fixture, 'Personal note').disabled).toBe(true);
    expect(field(fixture, 'Business name').disabled).toBe(false);
    expect(field(fixture, 'Owner’s email').disabled).toBe(false);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('A vendor has no phone number in the API yet');
    expect(text).toContain('nothing is emailed yet');
  });

  it('reads no markets picked as every market, and names the owner', () => {
    const fixture = open();
    const component = fixture.componentInstance;

    // There is no role to choose any more, so the summary's second half says
    // who owns the business rather than what access they get.
    expect(component['summary']()).toBe('All 7 markets · owner not named yet');

    fill(fixture);
    component['addMarket']('temple-bar');
    component['addMarket']('bantry-friday');
    fixture.detectChanges();
    expect(component['summary']()).toBe('2 markets selected · Dervla Ó Súilleabháin owns it');
  });

  it('clearing the market selection is how "all markets" is chosen', () => {
    const fixture = open();
    const component = fixture.componentInstance;

    component['addMarket']('temple-bar');
    expect(component['selectedMarkets']()).toEqual(['temple-bar']);

    component['selectAllMarkets']();
    expect(component['selectedMarkets']()).toEqual([]);
    expect(component['summary']()).toContain('All 7 markets');
  });

  it('pre-fills the market it was opened from, as a removable chip', () => {
    const fixture = open('temple-bar');
    const component = fixture.componentInstance;

    expect(component['selectedMarkets']()).toEqual(['temple-bar']);
    expect(component['summary']()).toBe('1 market selected · owner not named yet');
    expect(component['marketOptions']().map((market) => market.slug)).not.toContain('temple-bar');

    // It is a suggestion, not a lock — the admin can still clear it.
    component['removeMarket']('temple-bar');
    fixture.detectChanges();
    expect(component['selectedMarkets']()).toEqual([]);
    expect(component['summary']()).toContain('All 7 markets');
  });

  it('drops a market slug the market list does not know', () => {
    const fixture = open('not-a-market');
    fixture.detectChanges();

    expect(fixture.componentInstance['selectedMarkets']()).toEqual([]);
  });

  it('will not send without a business, a contact and an email', () => {
    const fixture = open();

    fixture.componentInstance['send']();

    expect(vendors.sent).toBeUndefined();
    expect(fixture.componentInstance['form'].touched).toBe(true);
  });

  it('will not send an address that is not an email', () => {
    const fixture = open();
    fill(fixture);
    fixture.componentInstance['form'].patchValue({ email: 'not-an-email' });

    fixture.componentInstance['send']();

    expect(vendors.sent).toBeUndefined();
  });

  it('sends the whole invitation and returns to the directory', () => {
    const fixture = open();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fill(fixture);
    fixture.componentInstance['addMarket']('bantry-friday');

    fixture.componentInstance['send']();

    expect(vendors.sent?.businessName).toBe('Coolea Cheese Co.');
    expect(vendors.sent?.email).toBe('dervla@cooleacheese.ie');
    expect(vendors.sent?.trade).toBe('Cheese & dairy');
    expect(vendors.sent?.marketSlugs).toEqual(['bantry-friday']);
    expect(vendors.sent?.skipApplicationReview).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/vendors']);
  });

  it('sends the seeded market and returns to that market, when opened from one', () => {
    const fixture = open('temple-bar');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fill(fixture);

    fixture.componentInstance['send']();

    expect(vendors.sent?.marketSlugs).toEqual(['temple-bar']);
    expect(navigate).toHaveBeenCalledWith(['/markets', 'temple-bar', 'vendors']);
  });

  it('"Save and add another" keeps the access choices and clears who it is for', () => {
    const fixture = open();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fill(fixture);
    fixture.componentInstance['addMarket']('bantry-friday');

    fixture.componentInstance['send'](true);
    fixture.detectChanges();

    const form = fixture.componentInstance['form'];
    expect(form.controls.businessName.value).toBe('');
    expect(form.controls.email.value).toBe('');
    expect(form.controls.note.value).toBe('');
    // The scope survives, because the next invitation is usually the same batch.
    expect(fixture.componentInstance['selectedMarkets']()).toEqual(['bantry-friday']);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('reports a refused invitation instead of pretending it sent', () => {
    const fixture = open();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    vendors.refuse = true;
    fill(fixture);

    fixture.componentInstance['send']();

    expect(fixture.componentInstance['facade'].error()).toBe(
      'Coolea Cheese Co. is already on MarketDay.',
    );
    expect(navigate).not.toHaveBeenCalled();
  });
});
