import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Observable, of, throwError } from 'rxjs';
import { AuthRepository } from '../../core/api/ports/auth-repository';
import { InMemoryAuthRepository } from '../../core/api/in-memory/in-memory-auth-repository';
import { SESSION_STORAGE } from '../../core/auth/session-storage';
import { MarketRepository } from '../../core/api/ports/market-repository';
import { VendorRepository } from '../../core/api/ports/vendor-repository';
import { MARKETS_FIXTURE } from '../../core/api/in-memory/in-memory-market-repository';
import {
  MCNALLY_DETAIL,
  MCNALLY_PROFILE,
  VENDORS_FIXTURE,
} from '../../core/api/in-memory/in-memory-vendor-repository';
import { IRISH_COUNTIES } from '../../core/models/location.model';
import { MarketDetail, MarketDraft, MarketSummary } from '../../core/models/market.model';
import {
  VendorDetail,
  VendorInvite as VendorInviteModel,
  VendorInviteSummary,
  VendorMemberRole,
  VendorProfile,
  VendorProfilePatch,
  VendorSummary,
} from '../../core/models/vendor.model';
import { VendorInvite } from './vendor-invite';

/** Markets are only read here, so a synchronous list is the whole stub. */
class StubMarketRepository extends MarketRepository {
  override list(): Observable<readonly MarketSummary[]> {
    return of(MARKETS_FIXTURE);
  }
  override detail(): Observable<MarketDetail> {
    return of({} as MarketDetail);
  }
  override counties(): Observable<readonly string[]> {
    return of(IRISH_COUNTIES);
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

  function open() {
    const fixture = TestBed.createComponent(VendorInvite);
    fixture.detectChanges();
    return fixture;
  }

  function fill(fixture: ReturnType<typeof open>) {
    fixture.componentInstance['form'].patchValue({
      businessName: 'Coolea Cheese Co.',
      contactName: 'Dervla Ó Súilleabháin',
      email: 'dervla@cooleacheese.ie',
      trade: 'Cheese & dairy',
      note: 'Dervla — we met at the Bantry organisers’ evening.',
    });
    fixture.detectChanges();
  }

  it('renders the form and the running invitation count', () => {
    const fixture = open();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Invite a vendor');
    expect(text).toContain('They set their own password and fill in the rest of their profile.');
    expect(text).toContain('14 invitations sent this month');
    expect(text).toContain('The invitation link is valid for 14 days.');
    expect(text).toContain('A reminder goes out after 5 days if there is no reply.');
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
    expect(text).toContain('we met at the Bantry organisers’ evening');
    expect(text).toContain('Set up your account');
    expect(text).toContain('Link expires');
  });

  it('reads no markets picked as every market, and says so', () => {
    const fixture = open();
    const component = fixture.componentInstance;

    expect(component['summary']()).toBe('All 7 markets · owner access');

    component['addMarket']('temple-bar');
    component['addMarket']('bantry-friday');
    fixture.detectChanges();
    expect(component['summary']()).toBe('2 markets selected · owner access');

    component['form'].patchValue({ role: VendorMemberRole.Staff });
    fixture.detectChanges();
    expect(component['summary']()).toBe('2 markets selected · stall access');
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
    expect(vendors.sent?.role).toBe(VendorMemberRole.Owner);
    expect(vendors.sent?.marketSlugs).toEqual(['bantry-friday']);
    expect(vendors.sent?.skipApplicationReview).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/vendors']);
  });

  it('"Save and add another" keeps the access choices and clears who it is for', () => {
    const fixture = open();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fill(fixture);
    fixture.componentInstance['addMarket']('bantry-friday');
    fixture.componentInstance['form'].patchValue({ skipApplicationReview: true });

    fixture.componentInstance['send'](true);
    fixture.detectChanges();

    const form = fixture.componentInstance['form'];
    expect(form.controls.businessName.value).toBe('');
    expect(form.controls.email.value).toBe('');
    expect(form.controls.note.value).toBe('');
    // The scope survives, because the next invitation is usually the same batch.
    expect(form.controls.skipApplicationReview.value).toBe(true);
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
