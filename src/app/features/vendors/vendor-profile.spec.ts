import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Observable, of, throwError } from 'rxjs';
import { VendorRepository } from '../../core/api/ports/vendor-repository';
import { MediaRepository, UploadedImage } from '../../core/api/ports/media-repository';
import {
  MCNALLY_DETAIL,
  MCNALLY_PROFILE,
  VENDORS_FIXTURE,
} from '../../core/api/in-memory/in-memory-vendor-repository';
import {
  VendorDetail,
  VendorInvite as VendorInviteModel,
  VendorInviteSummary,
  VendorProfile as VendorProfileModel,
  VendorProfilePatch,
  VendorSummary,
} from '../../core/models/vendor.model';
import { VendorDetailFacade } from './vendor-detail-facade';
import { VendorProfileFacade } from './vendor-profile-facade';
import { VendorProfile } from './vendor-profile';

/** The last patch a save sent, so a spec can assert on what was published. */
let saved: VendorProfilePatch | null = null;

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
  override profile(slug: string): Observable<VendorProfileModel> {
    if (slug !== MCNALLY_PROFILE.tradingName && slug !== 'mcnally-family-farm') {
      return throwError(() => new Error(`No vendor matches “${slug}”.`));
    }
    return of(MCNALLY_PROFILE);
  }
  override saveProfile(_slug: string, patch: VendorProfilePatch): Observable<VendorProfileModel> {
    if (patch.tradingName.trim() === '') {
      return throwError(() => new Error('A vendor needs a trading name.'));
    }
    saved = patch;
    return of({
      ...MCNALLY_PROFILE,
      ...patch,
      lastEdited: 'Last edited just now',
      lastEditedBy: 'by you, in the admin console',
    });
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

class StubMediaRepository extends MediaRepository {
  override upload(file: File): Observable<UploadedImage> {
    return of({ url: `stored:${file.name}`, fileName: file.name, sizeBytes: file.size });
  }
}

function open(slug = 'mcnally-family-farm') {
  TestBed.inject(VendorDetailFacade).load(slug);
  const fixture = TestBed.createComponent(VendorProfile);
  fixture.componentRef.setInput('slug', slug);
  fixture.detectChanges();
  return fixture;
}

function host(fixture: { nativeElement: unknown }): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function text(fixture: { nativeElement: unknown }): string {
  return host(fixture).textContent ?? '';
}

/** The input under a `mat-form-field` whose label reads `label`. */
function field(fixture: { nativeElement: unknown }, label: string): HTMLInputElement {
  const match = Array.from(host(fixture).querySelectorAll('mat-form-field')).find((wrapper) =>
    wrapper.querySelector('mat-label')?.textContent?.trim().startsWith(label),
  );
  expect(match).toBeDefined();
  const input = match!.querySelector('input, textarea');
  expect(input).not.toBeNull();
  return input as HTMLInputElement;
}

function type(
  fixture: { detectChanges(): void; nativeElement: unknown },
  label: string,
  value: string,
) {
  const input = field(fixture, label);
  input.value = value;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

function button(fixture: { nativeElement: unknown }, label: string): HTMLButtonElement {
  const match = Array.from(host(fixture).querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.trim().startsWith(label),
  );
  expect(match).toBeDefined();
  return match as HTMLButtonElement;
}

describe('VendorProfile', () => {
  beforeEach(async () => {
    saved = null;
    await TestBed.configureTestingModule({
      imports: [VendorProfile],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        VendorDetailFacade,
        VendorProfileFacade,
        { provide: VendorRepository, useClass: StubVendorRepository },
        { provide: MediaRepository, useClass: StubMediaRepository },
      ],
    }).compileComponents();
  });

  it('fills the form from the record', () => {
    const fixture = open();

    expect(field(fixture, 'Trading name').value).toBe('McNally Family Farm');
    expect(field(fixture, 'Registered name').value).toBe('McNally Produce Ltd');
    expect(field(fixture, 'VAT number').value).toBe('IE 4728116 F');
    expect(field(fixture, 'Stall description').value).toContain('Twelve acres in Ballyboughal');
    expect(field(fixture, 'Main contact').value).toBe('Tom McNally');
    expect(field(fixture, 'Phone').value).toBe('087 244 1180');
    expect(field(fixture, 'Email').value).toBe('tom@mcnallyfarm.ie');
    expect(field(fixture, 'Website').value).toBe('mcnallyfarm.ie');
    expect(field(fixture, 'Farm address').value).toBe(
      'Grallagh, Ballyboughal, Co. Dublin, A41 KV62',
    );
  });

  it('keeps a recorded trade the category list has since dropped', async () => {
    const fixture = open();
    // MatSelect matches its value to an option on a microtask.
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host(fixture).querySelector('.mat-mdc-select-value')?.textContent?.trim()).toBe(
      'Vegetables & eggs',
    );

    (host(fixture).querySelector('mat-select .mat-mdc-select-trigger') as HTMLElement).click();
    fixture.detectChanges();

    // The panel renders in an overlay outside the fixture, on the document.
    const options = Array.from(document.querySelectorAll('mat-option')).map((option) =>
      option.textContent?.trim(),
    );
    // Kept at the head of the list rather than dropped, so an unrelated save
    // cannot quietly rewrite what this vendor trades as.
    expect(options[0]).toBe('Vegetables & eggs');
    expect(options).toContain('Fruit & vegetables');
  });

  it('says how far the description reaches, and counts it against the limit', () => {
    const fixture = open();

    expect(text(fixture)).toContain('Shown to shoppers on every market page this vendor trades at');
    expect(text(fixture)).toContain(`${MCNALLY_PROFILE.description.length} / 400`);
  });

  it('counts the description as it is typed, not only as it loaded', () => {
    const fixture = open();

    type(fixture, 'Stall description', 'Twelve acres.');

    expect(text(fixture)).toContain('13 / 400');
  });

  it('lists the produce tags as removable chips', () => {
    const fixture = open();
    const chips = Array.from(host(fixture).querySelectorAll('mat-chip-row'));

    expect(chips.length).toBe(5);
    expect(chips[0]?.textContent).toContain('Vegetables');
    expect(chips.at(-1)?.textContent).toContain('Pre-order');
  });

  it('keeps Save inert until something actually changes', () => {
    const fixture = open();
    expect(button(fixture, 'Save changes').disabled).toBe(true);
    expect(button(fixture, 'Discard changes').disabled).toBe(true);

    type(fixture, 'Registered name', 'McNally Produce Limited');

    expect(button(fixture, 'Save changes').disabled).toBe(false);
    expect(text(fixture)).toContain('Unsaved changes on this record.');
  });

  it('publishes the whole record and settles back to pristine', () => {
    const fixture = open();

    type(fixture, 'Website', 'mcnallyfarm.com');
    button(fixture, 'Save changes').click();
    fixture.detectChanges();

    expect(saved?.website).toBe('mcnallyfarm.com');
    // Untouched fields go with it — this is the record, not a field patch.
    expect(saved?.tradingName).toBe('McNally Family Farm');
    expect(saved?.produceTags).toEqual([...MCNALLY_PROFILE.produceTags]);

    expect(button(fixture, 'Save changes').disabled).toBe(true);
    expect(text(fixture)).toContain('Last edited just now');
    expect(text(fixture)).toContain('by you, in the admin console');
  });

  it('drops unsaved edits back to the loaded record', () => {
    const fixture = open();

    type(fixture, 'Trading name', 'Something else entirely');
    button(fixture, 'Discard changes').click();
    fixture.detectChanges();

    expect(field(fixture, 'Trading name').value).toBe('McNally Family Farm');
    expect(button(fixture, 'Save changes').disabled).toBe(true);
    expect(saved).toBeNull();
  });

  it('refuses to publish a record with no trading name', () => {
    const fixture = open();

    type(fixture, 'Trading name', '');
    button(fixture, 'Save changes').click();
    fixture.detectChanges();

    expect(saved).toBeNull();
    expect(text(fixture)).toContain('A vendor needs a trading name');
  });

  it('names the market pages a save publishes to', () => {
    const fixture = open();

    expect(text(fixture)).toContain('Edits reach 3 market pages');
    expect(text(fixture)).toContain(
      'Saving publishes to Temple Bar Food Market, Marlay Park Market and Howth Harbour Market at once.',
    );
  });

  it('renders the record, its documents and who holds the account', () => {
    const fixture = open();
    const rail = host(fixture).querySelector('aside') as HTMLElement;

    expect(rail.textContent).toContain('v_1042');
    expect(rail.textContent).toContain('Created 14 March 2021 by Gráinne Doyle');
    expect(rail.textContent).toContain('Organic cert · renews 30 Sep');
    expect(rail.textContent).toContain('Tom McNally');
    expect(rail.textContent).toContain('Account holder · can transfer');
    expect(rail.textContent).toContain('Manage the 5 staff accounts');
  });

  it('adds a slot as soon as a photo lands', () => {
    const fixture = open();

    const zone = host(fixture).querySelector('md-image-upload') as HTMLElement;
    const picker = zone.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'stall.png', { type: 'image/png' });
    Object.defineProperty(picker, 'files', { value: [file] });
    picker.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    // The uploaded photo, plus the empty slot that takes the next one.
    expect(host(fixture).querySelectorAll('md-image-upload').length).toBe(2);
    expect(host(fixture).querySelector('md-image-upload img')?.getAttribute('src')).toBe(
      'stored:stall.png',
    );
  });

  it('offers a cover slot even though this vendor has no photos yet', () => {
    const fixture = open();
    const zones = host(fixture).querySelectorAll('md-image-upload');

    expect(zones.length).toBe(1);
    expect(zones[0]?.textContent).toContain('Cover');
    expect(text(fixture)).toContain('The first photo is the cover shoppers see');
  });
});

/** A record no vendor has — the tab has to say so rather than sit blank. */
class MissingVendorRepository extends StubVendorRepository {
  override profile(): Observable<VendorProfileModel> {
    return throwError(() => new Error('No vendor matches “nobody”.'));
  }
}

describe('VendorProfile for a vendor that is not there', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VendorProfile],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        VendorDetailFacade,
        VendorProfileFacade,
        { provide: VendorRepository, useClass: MissingVendorRepository },
        { provide: MediaRepository, useClass: StubMediaRepository },
      ],
    }).compileComponents();
  });

  it('reports the error and offers a retry', () => {
    const fixture = open('nobody');

    expect(text(fixture)).toContain('No vendor matches “nobody”.');
    expect(text(fixture)).toContain('Retry');
    expect(host(fixture).querySelector('form')).toBeNull();
  });
});
