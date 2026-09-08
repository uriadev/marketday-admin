import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { GraphqlVendorRepository } from './graphql-vendor-repository';
import { VendorRepository } from '../ports/vendor-repository';
import { VendorInvite, VendorProfilePatch } from '../../models/vendor.model';
import { environment } from '../../../../environments/environment';

/** What the form hands the port, with the fields each test cares about set. */
function invite(overrides: Partial<VendorInvite> = {}): VendorInvite {
  return {
    businessName: 'Coolea Cheese Co.',
    contactName: 'Dervla Ó Súilleabháin',
    email: 'dervla@cooleacheese.ie',
    phone: '',
    trade: 'Cheese & dairy',
    marketSlugs: [],
    skipApplicationReview: false,
    note: 'Dervla — we met at the Bantry organisers’ evening.',
    ...overrides,
  };
}

/** A `VendorModel` shaped like the `VendorFields` fragment selects it. */
const CREATED = {
  id: 'vnd-1',
  slug: 'coolea-cheese-co',
  name: 'Coolea Cheese Co.',
  category: 'Cheese & dairy',
  description: null,
  imageUrl: null,
  isActive: true,
  isAcceptingOrders: true,
  memberCount: 0,
  createdAt: '2026-09-06T10:00:00.000Z',
  updatedAt: '2026-09-06T10:00:00.000Z',
  markets: [],
};

/** The vendor the Profile tab edits, as `vendor(id)` / `adminVendors` hand it back. */
const MCNALLY = {
  id: 'vnd-mcnally',
  slug: 'mcnally-family-farm',
  name: 'McNally Family Farm',
  category: 'Fruit & vegetables',
  description: 'Twelve acres of vegetables outside Ballyboughal.',
  imageUrl: 'https://cdn.marketday.ie/vendors/vnd-mcnally/stall.jpg',
  isActive: true,
  isAcceptingOrders: true,
  memberCount: 4,
  createdAt: '2021-03-14T09:00:00.000Z',
  updatedAt: '2021-03-14T09:00:00.000Z',
  markets: [],
};

/**
 * What the Profile tab hands the port — the whole form, disabled controls
 * included, since the tab sends `getRawValue()`. Most of it has no column
 * server-side, which is the point of the tests below.
 */
function patch(overrides: Partial<VendorProfilePatch> = {}): VendorProfilePatch {
  return {
    tradingName: 'McNally Family Farm',
    registeredName: 'McNally Produce Ltd',
    category: 'Fruit & vegetables',
    vatNumber: 'IE1234567X',
    description: 'Twelve acres of vegetables outside Ballyboughal.',
    produceTags: ['Potatoes', 'Kale'],
    contactName: 'Tom McNally',
    phone: '+353 87 000 0000',
    email: 'tom@mcnallyfarm.ie',
    website: 'mcnallyfarm.ie',
    address: 'Ballyboughal, Co. Dublin',
    imageUrl: 'https://cdn.marketday.ie/vendors/vnd-mcnally/stall.jpg',
    ...overrides,
  };
}

let repository: VendorRepository;
let http: HttpTestingController;

beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: VendorRepository, useClass: GraphqlVendorRepository },
    ],
  });
  repository = TestBed.inject(VendorRepository);
  http = TestBed.inject(HttpTestingController);
});

afterEach(() => http.verify());

/** One posted GraphQL document, with its operation name and variables. */
function expectPost(operation: string) {
  const request = http.expectOne(environment.api.graphqlUrl);
  const body = request.request.body as { query: string; variables: Record<string, unknown> };
  expect(body.query).toContain(operation);
  return { request, variables: body.variables };
}

/** The slug → id lookup every vendor-scoped call makes first. */
function resolveSlug() {
  expectPost('query AdminVendors').request.flush({
    data: { adminVendors: { totalCount: 1, items: [MCNALLY] } },
  });
}

describe('GraphqlVendorRepository.invite', () => {
  it('creates the vendor from the name, the trade and the owner, and maps the row back', () => {
    let created: { slug: string; name: string; standingLabel: string | null } | undefined;
    repository.invite(invite()).subscribe((row) => (created = row));

    const { request, variables } = expectPost('mutation CreateVendor');
    // The contact is the owner: the backend seats them, so these two are not
    // optional extras. There is no `role` — one vendor, one owner seat.
    expect(variables['input']).toEqual({
      name: 'Coolea Cheese Co.',
      category: 'Cheese & dairy',
      ownerName: 'Dervla Ó Súilleabháin',
      ownerEmail: 'dervla@cooleacheese.ie',
      isAcceptingOrders: false,
    });
    request.flush({ data: { createVendor: CREATED } });

    expect(created?.slug).toBe('coolea-cheese-co');
    expect(created?.name).toBe('Coolea Cheese Co.');
    // A vendor that is active and accepting orders reads Trading — never the
    // fixture's old 'Invitation pending'.
    expect(created?.standingLabel).toBe('Trading');
  });

  it('carries "skip application review" on isAcceptingOrders', () => {
    // There is no application model server-side (gap #9), so the flag the
    // schema does have holds "approved yet?": review required → created paused.
    repository.invite(invite({ skipApplicationReview: true })).subscribe();
    let post = expectPost('mutation CreateVendor');
    expect(post.variables['input']).toMatchObject({ isAcceptingOrders: true });
    post.request.flush({ data: { createVendor: CREATED } });

    repository.invite(invite({ skipApplicationReview: false })).subscribe();
    post = expectPost('mutation CreateVendor');
    expect(post.variables['input']).toMatchObject({ isAcceptingOrders: false });
    post.request.flush({
      data: { createVendor: { ...CREATED, isAcceptingOrders: false } },
    });
  });

  it('reads a paused vendor back as Paused, not Trading', () => {
    let created: { standingLabel: string | null } | undefined;
    repository.invite(invite()).subscribe((row) => (created = row));

    expectPost('mutation CreateVendor').request.flush({
      data: { createVendor: { ...CREATED, isAcceptingOrders: false } },
    });

    expect(created?.standingLabel).toBe('Paused');
  });

  it('omits marketIds entirely when no market was picked', () => {
    // "No markets picked" means every market on this screen, and `marketIds`
    // is nullable — an empty array would read as a real, empty scope.
    repository.invite(invite()).subscribe();

    const { request, variables } = expectPost('mutation CreateVendor');
    expect(variables['input']).not.toHaveProperty('marketIds');
    request.flush({ data: { createVendor: CREATED } });
  });

  it('resolves picked market slugs to ids before creating', () => {
    repository.invite(invite({ marketSlugs: ['bantry-friday', 'temple-bar'] })).subscribe();

    expectPost('query MarketIds').request.flush({
      data: {
        adminMarkets: [
          { id: 'mkt-tb', slug: 'temple-bar' },
          { id: 'mkt-bf', slug: 'bantry-friday' },
        ],
      },
    });

    const { request, variables } = expectPost('mutation CreateVendor');
    // In the order the admin picked them, not the order the API listed them.
    expect(variables['input']).toMatchObject({ marketIds: ['mkt-bf', 'mkt-tb'] });
    request.flush({ data: { createVendor: CREATED } });
  });

  it('looks the market list up once and reuses it', () => {
    repository.invite(invite({ marketSlugs: ['temple-bar'] })).subscribe();
    expectPost('query MarketIds').request.flush({
      data: { adminMarkets: [{ id: 'mkt-tb', slug: 'temple-bar' }] },
    });
    expectPost('mutation CreateVendor').request.flush({ data: { createVendor: CREATED } });

    repository.invite(invite({ marketSlugs: ['temple-bar'] })).subscribe();

    // No second MarketIds query: straight to the mutation.
    expectPost('mutation CreateVendor').request.flush({ data: { createVendor: CREATED } });
  });

  it('fails rather than quietly creating a vendor at fewer markets', () => {
    let error: Error | undefined;
    repository
      .invite(invite({ marketSlugs: ['temple-bar', 'gone'] }))
      .subscribe({ error: (cause: Error) => (error = cause) });

    expectPost('query MarketIds').request.flush({
      data: { adminMarkets: [{ id: 'mkt-tb', slug: 'temple-bar' }] },
    });

    expect(error?.message).toContain('gone');
  });

  it('refuses a blank business name without calling the API', () => {
    let error: Error | undefined;
    repository
      .invite(invite({ businessName: '   ' }))
      .subscribe({ error: (cause: Error) => (error = cause) });

    expect(error?.message).toBe('A vendor needs a business name.');
    http.expectNone(environment.api.graphqlUrl);
  });

  it('refuses to create a vendor with no owner named', () => {
    // The backend refuses this too. Sending it anyway would be asking the
    // server to pick an owner, and the only one it could pick is the calling
    // admin — the outcome this whole path exists to avoid.
    for (const missing of [{ contactName: '  ' }, { email: '' }]) {
      let error: Error | undefined;
      repository.invite(invite(missing)).subscribe({ error: (cause: Error) => (error = cause) });

      expect(error?.message).toBe('A vendor needs an owner name and email address.');
    }
    http.expectNone(environment.api.graphqlUrl);
  });

  it('surfaces the backend message when the create is refused', () => {
    let error: Error | undefined;
    repository.invite(invite()).subscribe({ error: (cause: Error) => (error = cause) });

    expectPost('mutation CreateVendor').request.flush({
      errors: [{ message: 'Slug already in use' }],
    });

    expect(error?.message).toBe('Slug already in use');
  });

  it('counts what it created, since nothing server-side does', () => {
    let before: number | undefined;
    repository.inviteSummary().subscribe((summary) => (before = summary.sentThisMonth));
    expect(before).toBe(0);

    repository.invite(invite()).subscribe();
    expectPost('mutation CreateVendor').request.flush({ data: { createVendor: CREATED } });

    let after: number | undefined;
    repository.inviteSummary().subscribe((summary) => (after = summary.sentThisMonth));
    expect(after).toBe(1);
  });
});

describe('GraphqlVendorRepository.saveProfile', () => {
  it('resolves the slug, then sends only what UpdateVendorInput has a column for', () => {
    let published: { tradingName: string } | undefined;
    repository
      .saveProfile('mcnally-family-farm', patch({ tradingName: 'McNally Family Farm & Co.' }))
      .subscribe((profile) => (published = profile));

    // `updateVendor` takes an id and the console routes by slug.
    resolveSlug();

    const { request, variables } = expectPost('mutation UpdateVendor');
    expect(variables['id']).toBe('vnd-mcnally');
    // Exactly four fields. The registered name, VAT, produce tags, contact
    // block and address ride along in the patch — the form sends its raw value
    // — and are dropped here rather than posted where nothing would read them.
    expect(variables['input']).toEqual({
      name: 'McNally Family Farm & Co.',
      category: 'Fruit & vegetables',
      description: 'Twelve acres of vegetables outside Ballyboughal.',
      imageUrl: 'https://cdn.marketday.ie/vendors/vnd-mcnally/stall.jpg',
    });
    request.flush({
      data: { updateVendor: { ...MCNALLY, name: 'McNally Family Farm & Co.' } },
    });

    // The stored row, not the form's copy of it.
    expect(published?.tradingName).toBe('McNally Family Farm & Co.');
  });

  it('never sends slug, so a rename keeps the URL the console routes by', () => {
    // The backend does not re-derive the slug from a changed name, and this
    // must not ask it to: every link already shared points at the old one.
    repository.saveProfile('mcnally-family-farm', patch({ tradingName: 'Renamed' })).subscribe();
    resolveSlug();

    const { request, variables } = expectPost('mutation UpdateVendor');
    expect(variables['input']).not.toHaveProperty('slug');
    request.flush({ data: { updateVendor: { ...MCNALLY, name: 'Renamed' } } });
  });

  it('sends an explicit null when the photo was cleared', () => {
    // Omitting the field reads as "leave it alone", which would keep a picture
    // the admin just removed.
    repository.saveProfile('mcnally-family-farm', patch({ imageUrl: null })).subscribe();
    resolveSlug();

    const { request, variables } = expectPost('mutation UpdateVendor');
    expect(variables['input']).toMatchObject({ imageUrl: null });
    request.flush({ data: { updateVendor: { ...MCNALLY, imageUrl: null } } });
  });

  it('trims the trading name it sends', () => {
    repository
      .saveProfile('mcnally-family-farm', patch({ tradingName: '  McNally Family Farm  ' }))
      .subscribe();
    resolveSlug();

    const { request, variables } = expectPost('mutation UpdateVendor');
    expect(variables['input']).toMatchObject({ name: 'McNally Family Farm' });
    request.flush({ data: { updateVendor: MCNALLY } });
  });

  it('refuses a blank trading name without calling the API', () => {
    let error: Error | undefined;
    repository
      .saveProfile('mcnally-family-farm', patch({ tradingName: '   ' }))
      .subscribe({ error: (cause: Error) => (error = cause) });

    expect(error?.message).toBe('A vendor needs a trading name.');
    // Not even the slug lookup: there is nothing worth resolving for a save
    // the server would refuse anyway.
    http.expectNone(environment.api.graphqlUrl);
  });

  it('moves "Last edited" with updatedAt, and names nobody', () => {
    let published: { lastEdited: string; lastEditedBy: string } | undefined;
    repository
      .saveProfile('mcnally-family-farm', patch())
      .subscribe((profile) => (published = profile));
    resolveSlug();

    expectPost('mutation UpdateVendor').request.flush({
      data: { updateVendor: { ...MCNALLY, updatedAt: '2026-09-08T11:30:00.000Z' } },
    });

    expect(published?.lastEdited).toContain('Last edited');
    // `VendorModel` stamps when a record changed, never who changed it.
    expect(published?.lastEditedBy).toBe('');
  });

  it('surfaces the refusal a backend without the admin branch would send', () => {
    // What `updateVendor` answered before it learned to take an ADMIN caller,
    // and what it still answers to anyone else: `RolesGuard`'s own
    // `ForbiddenException`, which `graphql-errors.ts` turns into a sentence.
    let error: Error | undefined;
    repository
      .saveProfile('mcnally-family-farm', patch())
      .subscribe({ error: (cause: Error) => (error = cause) });
    resolveSlug();

    expectPost('mutation UpdateVendor').request.flush({
      errors: [{ message: 'Forbidden resource' }],
    });

    expect(error?.message).toBe('You do not have permission to do that.');
  });

  it('reuses the id the directory read already resolved', () => {
    repository.list().subscribe();
    resolveSlug();

    repository.saveProfile('mcnally-family-farm', patch()).subscribe();

    // No second AdminVendors query: straight to the mutation.
    expectPost('mutation UpdateVendor').request.flush({ data: { updateVendor: MCNALLY } });
  });

  it('re-reads the record rather than replaying the edit it just made', () => {
    // The save used to be held in memory and layered over the real read, which
    // meant a reload showed an edit the backend had never accepted.
    repository.saveProfile('mcnally-family-farm', patch({ tradingName: 'Renamed' })).subscribe();
    resolveSlug();
    expectPost('mutation UpdateVendor').request.flush({
      data: { updateVendor: { ...MCNALLY, name: 'Renamed' } },
    });

    let reloaded: { tradingName: string } | undefined;
    repository.profile('mcnally-family-farm').subscribe((profile) => (reloaded = profile));

    expectPost('query VendorById').request.flush({ data: { vendor: MCNALLY } });
    expect(reloaded?.tradingName).toBe('McNally Family Farm');
  });
});
