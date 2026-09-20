import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Observable, of, throwError } from 'rxjs';
import { VendorRepository } from '../../../core/api/ports/vendor-repository';
import { MediaRepository, UploadedImage } from '../../../core/api/ports/media-repository';
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
  VendorProfile as VendorProfileModel,
  VendorProfilePatch,
  VendorSummary,
} from '../../../core/models/vendor.model';
import { VendorDetailFacade } from '../vendor-detail-facade';
import { VendorProfileFacade } from '../vendor-profile-facade';
import { VendorProfile } from './vendor-profile';

/** The last patch a save sent, so a spec can assert on what was published. */
let saved: VendorProfilePatch | null = null;
let media: StubMediaRepository;

class StubVendorRepository extends VendorRepository {
  /** The directory is not what these tests are about — an empty page satisfies
   *  the port. */
  override list(): Observable<VendorDirectoryPage> {
    return of({
      items: [],
      total: 0,
      facets: { markets: [], applicationCount: 0, vendorCount: 0 },
    });
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
    // The real-API shape: a profile read through GraphQL carries the id its
    // photo presign is keyed by, which the fixture has no server-side id for.
    return of({ ...MCNALLY_PROFILE, vendorId: 'vnd-mcnally' });
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
  override setActive(): Observable<VendorSummary> {
    return of(VENDORS_FIXTURE[0]!);
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
  /** What the last upload asked for — the presign is keyed by the vendor. */
  lastCall: { kind: string; vendorId?: string } | null = null;

  override upload(file: File, kind: string, vendorId?: string): Observable<UploadedImage> {
    this.lastCall = { kind, vendorId };
    return of({ url: `stored:${file.name}`, fileName: file.name, sizeBytes: file.size });
  }
}

/** Hands the first drop zone a file the way picking one does. */
function pickPhoto(fixture: { nativeElement: unknown; detectChanges: () => void }): void {
  const zone = host(fixture).querySelector('md-image-upload') as HTMLElement;
  const picker = zone.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['x'], 'stall.png', { type: 'image/png' });
  Object.defineProperty(picker, 'files', { value: [file] });
  picker.dispatchEvent(new Event('change'));
  fixture.detectChanges();
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

/** The chip grid's own input — the one that used to add a produce tag. */
function tagInput(fixture: { nativeElement: unknown }): HTMLInputElement {
  const input = host(fixture).querySelector('input[placeholder="Add produce tag"]');
  expect(input).not.toBeNull();
  return input as HTMLInputElement;
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
    media = new StubMediaRepository();
    await TestBed.configureTestingModule({
      imports: [VendorProfile],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        VendorDetailFacade,
        VendorProfileFacade,
        { provide: VendorRepository, useClass: StubVendorRepository },
        { provide: MediaRepository, useValue: media },
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

  it('lists the produce tags it holds, with no way to change them', () => {
    const fixture = open();
    const chips = Array.from(host(fixture).querySelectorAll('mat-chip-row'));

    expect(chips.length).toBe(5);
    expect(chips[0]?.textContent).toContain('Vegetables');
    expect(chips.at(-1)?.textContent).toContain('Pre-order');

    // `VendorModel` has no tags column (docs/backend-api-gaps.md #7), so the
    // grid shows what is on file and takes nothing new.
    expect(tagInput(fixture).disabled).toBe(true);
  });

  it('greys out every field the API has no column for', () => {
    const fixture = open();

    // `UpdateVendorInput` carries the trading name, category, description and
    // photo. Anything else typed here would be dropped by the save, so it is
    // disabled rather than left looking editable — gap #7.
    for (const label of [
      'Registered name',
      'VAT number',
      'Main contact',
      'Phone',
      'Email',
      'Website',
      'Farm address',
    ]) {
      expect(field(fixture, label).disabled).toBe(true);
    }
    expect(field(fixture, 'Trading name').disabled).toBe(false);
    expect(field(fixture, 'Stall description').disabled).toBe(false);

    // And says why, rather than leaving an admin to wonder what is broken.
    expect(text(fixture)).toContain('Not stored by the API yet');
    expect(text(fixture)).toContain('None of this reaches the backend yet');
  });

  it('keeps Save inert until something actually changes', () => {
    const fixture = open();
    expect(button(fixture, 'Save changes').disabled).toBe(true);
    expect(button(fixture, 'Discard changes').disabled).toBe(true);

    type(fixture, 'Trading name', 'McNally Family Farm & Sons');

    expect(button(fixture, 'Save changes').disabled).toBe(false);
    expect(text(fixture)).toContain('Unsaved changes on this record.');
  });

  it('publishes the whole record and settles back to pristine', () => {
    const fixture = open();

    type(fixture, 'Stall description', 'Twelve acres in Ballyboughal.');
    button(fixture, 'Save changes').click();
    fixture.detectChanges();

    expect(saved?.description).toBe('Twelve acres in Ballyboughal.');
    // Untouched fields go with it — this is the record, not a field patch —
    // and that includes the disabled ones, which ride along unchanged rather
    // than being blanked by a save they have no column for.
    expect(saved?.tradingName).toBe('McNally Family Farm');
    expect(saved?.website).toBe('mcnallyfarm.ie');
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

  it('presigns the photo against the vendor it belongs to', () => {
    const fixture = open();

    pickPhoto(fixture);

    // Without the vendor the backend has nothing to resolve one from — an admin
    // holds no seat at a vendor — and answers "Specify the vendor this image
    // belongs to."
    expect(media.lastCall).toEqual({ kind: 'vendor-image', vendorId: 'vnd-mcnally' });
  });

  it('fills the one slot when a photo lands, without offering a second', () => {
    const fixture = open();

    pickPhoto(fixture);

    // `Vendor.imageUrl` is a single column, so a second zone would take a photo
    // the save then dropped.
    expect(host(fixture).querySelectorAll('md-image-upload').length).toBe(1);
    expect(host(fixture).querySelector('md-image-upload img')?.getAttribute('src')).toBe(
      'stored:stall.png',
    );
  });

  it('sends the photo as the one image on the record', () => {
    const fixture = open();

    pickPhoto(fixture);
    button(fixture, 'Save changes').click();

    expect(saved?.imageUrl).toBe('stored:stall.png');
  });

  it('offers a cover slot even though this vendor has no photo yet', () => {
    const fixture = open();
    const zones = host(fixture).querySelectorAll('md-image-upload');

    expect(zones.length).toBe(1);
    expect(zones[0]?.textContent).toContain('Cover');
    expect(text(fixture)).toContain('The cover shoppers see beside this vendor');
  });

  it('asks for the same 1600×800 hero a market banner takes', () => {
    const fixture = open();
    const zone = host(fixture).querySelector('md-image-upload') as HTMLElement;

    expect(zone.textContent).toContain('1600×800px');
    // The preview box is the shape of the file it is asking for, so a wide
    // hero is not previewed in a 4:3 box that crops it.
    expect((zone.querySelector('.md-upload__zone') as HTMLElement).style.aspectRatio).toBe('2 / 1');
  });
});

/**
 * What `vendor(id)` actually answers with: the four covered fields filled and
 * every uncovered one blank, since the backend has no column to fill them from.
 */
class RealApiShapeRepository extends StubVendorRepository {
  override profile(): Observable<VendorProfileModel> {
    return of({
      ...MCNALLY_PROFILE,
      vendorId: 'vnd-mcnally',
      registeredName: '',
      vatNumber: '',
      produceTags: [],
      contactName: '',
      phone: '',
      email: '',
      website: '',
      address: '',
    });
  }
}

describe('VendorProfile against the record the real API returns', () => {
  beforeEach(async () => {
    saved = null;
    media = new StubMediaRepository();
    await TestBed.configureTestingModule({
      imports: [VendorProfile],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        VendorDetailFacade,
        VendorProfileFacade,
        { provide: VendorRepository, useClass: RealApiShapeRepository },
        { provide: MediaRepository, useValue: media },
      ],
    }).compileComponents();
  });

  it('still saves, though the main contact it asks for is blank and required', () => {
    const fixture = open();

    // `contactName` keeps its `required` validator for the day the column
    // lands, and a disabled control is skipped by the group's validity — so a
    // blank one cannot lock the Save button on a record no admin can fill.
    type(fixture, 'Stall description', 'Twelve acres in Ballyboughal.');
    button(fixture, 'Save changes').click();
    fixture.detectChanges();

    expect(saved?.description).toBe('Twelve acres in Ballyboughal.');
    expect(saved?.contactName).toBe('');
    expect(text(fixture)).not.toContain('Some fields still need attention');
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
        { provide: MediaRepository, useValue: media },
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
