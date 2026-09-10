import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { GraphqlAccountRepository } from './graphql-account-repository';
import { AccountRepository } from '../ports/account-repository';
import {
  Account,
  AccountDirectoryPage,
  AccountFilters,
  AccountListQuery,
  EMPTY_ACCOUNT_FILTERS,
} from '../../models/account.model';
import { environment } from '../../../../environments/environment';

/** "Now", for every relative label below. A Thursday afternoon in Dublin. */
const NOW = new Date('2026-09-10T14:00:00.000Z');
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();

/** An `AdminUserModel` shaped like the `AdminUserFields` fragment selects it. */
function user(overrides: Record<string, unknown> = {}) {
  return {
    id: '3f9a1c2b-0000-4000-8000-000000000001',
    email: 'niamh.brady@gmail.com',
    fullName: 'Niamh Brady',
    role: 'BUYER',
    status: 'ACTIVE',
    createdAt: '2021-03-14T09:00:00.000Z',
    lastSeenAt: minutesAgo(18),
    vendor: null,
    suspensionReason: null,
    suspendedByName: null,
    ...overrides,
  };
}

/** The six aliased counts `ADMIN_USERS` asks beside the page. */
const COUNTS = {
  everyone: { totalCount: 318 },
  shoppers: { totalCount: 262 },
  vendorStaff: { totalCount: 41 },
  admins: { totalCount: 15 },
  suspended: { totalCount: 2 },
  invited: { totalCount: 3 },
};

let repository: AccountRepository;
let http: HttpTestingController;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: AccountRepository, useClass: GraphqlAccountRepository },
    ],
  });
  repository = TestBed.inject(AccountRepository);
  http = TestBed.inject(HttpTestingController);
});

afterEach(() => {
  http.verify();
  vi.useRealTimers();
});

/** One posted GraphQL document, with its operation name and variables. */
function expectPost(operation: string) {
  const request = http.expectOne(environment.api.graphqlUrl);
  const body = request.request.body as { query: string; variables: Record<string, unknown> };
  expect(body.query).toContain(operation);
  return { request, variables: body.variables };
}

function listQuery(
  filters: Partial<AccountFilters> = {},
  page = { index: 0, size: 25 },
): AccountListQuery {
  return { filters: { ...EMPTY_ACCOUNT_FILTERS, ...filters }, page };
}

/** Lists, answers with `items`, and hands back what the port returned. */
function list(query: AccountListQuery, items: unknown[] = [], totalCount = items.length) {
  let page: AccountDirectoryPage | undefined;
  repository.list(query).subscribe((result) => (page = result));
  const { request, variables } = expectPost('query AdminUsers');
  request.flush({ data: { adminUsers: { totalCount, items }, ...COUNTS } });
  return { page: page!, variables };
}

/** One mapped row, from one `AdminUserModel`. */
function row(overrides: Record<string, unknown> = {}): Account {
  return list(listQuery(), [user(overrides)]).page.items[0]!;
}

const yearStart = new Date(NOW.getFullYear(), 0, 1).toISOString();

describe('GraphqlAccountRepository.list', () => {
  it('asks for the page on screen, and nothing the admin did not pick', () => {
    const { variables } = list(listQuery({}, { index: 2, size: 25 }));

    expect(variables).toEqual({
      search: null,
      status: null,
      criteria: { filters: [], limit: 25, offset: 50 },
    });
  });

  it('pushes every filter down to the server', () => {
    const { variables } = list(
      listQuery({
        q: '  whelan ',
        role: 'vendor-staff',
        status: 'suspended',
        signedUp: 'thisYear',
      }),
    );

    expect(variables).toEqual({
      // Name or email, in one argument — a CriteriaInput filter cannot OR.
      search: 'whelan',
      status: 'SUSPENDED',
      criteria: {
        filters: [
          { field: 'role', operator: 'EQUAL', value: 'VENDOR' },
          { field: 'createdAt', operator: 'GTE', value: yearStart },
        ],
        limit: 25,
        offset: 0,
      },
    });
  });

  it('asks the other two sign-up windows as createdAt bounds', () => {
    const earlier = list(listQuery({ signedUp: 'earlier' })).variables;
    expect((earlier['criteria'] as { filters: unknown[] }).filters).toEqual([
      { field: 'createdAt', operator: 'LT', value: yearStart },
    ]);

    const last30 = list(listQuery({ signedUp: 'last30' })).variables;
    expect((last30['criteria'] as { filters: unknown[] }).filters).toEqual([
      {
        field: 'createdAt',
        operator: 'GTE',
        value: new Date(NOW.getTime() - 30 * 24 * 60 * 60_000).toISOString(),
      },
    ]);
  });

  it('counts the header and both menus from the aliases, not the page', () => {
    const { page } = list(listQuery({ status: 'suspended' }), [], 0);

    expect(page.total).toBe(0);
    expect(page.facets).toEqual({
      accountCount: 318,
      roleCounts: { shopper: 262, 'vendor-staff': 41, organiser: 0, support: 0, admin: 15 },
      statusCounts: { active: 313, invited: 3, suspended: 2 },
    });
  });

  it('answers an organiser filter with nothing — no column says who organises', () => {
    const { page, variables } = list(listQuery({ role: 'organiser' }), [user()], 318);

    // Still asked, because the counts have to be; but no rows are wanted.
    expect(variables['criteria']).toEqual({ limit: 1 });
    expect(page.items).toEqual([]);
    expect(page.total).toBe(0);
    expect(page.facets.accountCount).toBe(318);
  });
});

describe('GraphqlAccountRepository row mapping', () => {
  it('reads a shopper the way design 1i draws one', () => {
    expect(row()).toEqual({
      id: '3f9a1c2b-0000-4000-8000-000000000001',
      name: 'Niamh Brady',
      email: 'niamh.brady@gmail.com',
      role: 'shopper',
      userRole: 'BUYER',
      attached: '—',
      attachedLink: null,
      lastActive: '18m ago',
      signedUp: '14 March 2021',
      signedUpBucket: 'earlier',
      status: 'active',
      suspendedNote: null,
    });
  });

  it('attaches vendor staff to their vendor, and admins to the team', () => {
    const tom = row({
      role: 'VENDOR',
      vendor: { id: 'vnd-1', slug: 'mcnally-family-farm', name: 'McNally Family Farm' },
    });
    expect(tom.role).toBe('vendor-staff');
    expect(tom.attached).toBe('McNally Family Farm');
    expect(tom.attachedLink).toEqual(['/vendors', 'mcnally-family-farm']);

    const aine = row({ role: 'ADMIN' });
    // Every ADMIN is a platform admin: organiser and support have no column.
    expect(aine.role).toBe('admin');
    expect(aine.attached).toBe('MarketDay team');
    expect(aine.attachedLink).toBeNull();
  });

  it('says how long ago, in the design’s register, and the day past a month', () => {
    expect(row({ lastSeenAt: minutesAgo(0) }).lastActive).toBe('Just now');
    expect(row({ lastSeenAt: minutesAgo(4 * 60) }).lastActive).toBe('4h ago');
    expect(row({ lastSeenAt: minutesAgo(3 * 24 * 60) }).lastActive).toBe('3d ago');
    expect(row({ lastSeenAt: minutesAgo(21 * 24 * 60) }).lastActive).toBe('3w ago');
    expect(row({ lastSeenAt: '2026-03-02T10:00:00.000Z' }).lastActive).toBe('2 March 2026');
    expect(row({ lastSeenAt: null }).lastActive).toBe('Never');
  });

  it('buckets the sign-up date the way the menu filters it', () => {
    expect(row({ createdAt: minutesAgo(10 * 24 * 60) }).signedUpBucket).toBe('last30');
    expect(row({ createdAt: '2026-02-03T09:00:00.000Z' }).signedUpBucket).toBe('thisYear');
    expect(row({ createdAt: '2025-12-30T09:00:00.000Z' }).signedUpBucket).toBe('earlier');
  });

  it('reads an account with no way to sign in yet as invited', () => {
    expect(row({ status: 'INVITED', lastSeenAt: null }).status).toBe('invited');
  });

  it('redacts a suspended account and says why and by whom', () => {
    const rob = row({
      role: 'VENDOR',
      status: 'SUSPENDED',
      fullName: 'Rob Whelan',
      email: 'rob.whelan@gmail.com',
      vendor: { id: 'vnd-1', slug: 'mcnally-family-farm', name: 'McNally Family Farm' },
      suspensionReason: 'Repeated no-shows on collected pre-orders',
      suspendedByName: 'Áine Ryan',
    });

    expect(rob.name).toBe('Account #3f9a1c2b');
    expect(rob.email).toBe('hidden after suspension');
    expect(rob.attachedLink).toBeNull();
    expect(rob.suspendedNote).toBe(
      'Repeated no-shows on collected pre-orders · suspended by Áine Ryan',
    );
  });
});

describe('GraphqlAccountRepository commands', () => {
  it('suspends with the trimmed reason and maps the row the server stored', () => {
    let suspended: Account | undefined;
    repository.suspend('user-2', '  Repeated chargebacks ').subscribe((a) => (suspended = a));

    const { request, variables } = expectPost('mutation SuspendUser');
    expect(variables).toEqual({ input: { userId: 'user-2', reason: 'Repeated chargebacks' } });
    request.flush({
      data: {
        suspendUser: user({
          status: 'SUSPENDED',
          suspensionReason: 'Repeated chargebacks',
          suspendedByName: 'Áine Ryan',
        }),
      },
    });

    expect(suspended?.status).toBe('suspended');
    expect(suspended?.email).toBe('hidden after suspension');
  });

  it('will not send a suspension without a reason', () => {
    let error: Error | undefined;
    repository.suspend('user-2', '   ').subscribe({ error: (cause: Error) => (error = cause) });

    expect(error?.message).toBe('A suspension needs a reason.');
    // `http.verify()` in afterEach proves nothing was posted.
  });

  it('shows the backend’s own refusal', () => {
    let error: Error | undefined;
    repository
      .suspend('admin-1', 'Testing')
      .subscribe({ error: (cause: Error) => (error = cause) });

    expectPost('mutation SuspendUser').request.flush({
      errors: [
        {
          message: 'You cannot suspend your own account.',
          extensions: {
            code: 'BAD_REQUEST',
            originalError: { statusCode: 400, message: 'You cannot suspend your own account.' },
          },
        },
      ],
    });

    expect(error?.message).toBe('You cannot suspend your own account.');
  });

  it('restores by id and maps the reopened row', () => {
    let restored: Account | undefined;
    repository.restore('user-2').subscribe((a) => (restored = a));

    const { request, variables } = expectPost('mutation RestoreUser');
    expect(variables).toEqual({ userId: 'user-2' });
    request.flush({ data: { restoreUser: user() } });

    expect(restored?.name).toBe('Niamh Brady');
    expect(restored?.status).toBe('active');
  });

  it('sends a password reset through the public mutation Forgot password uses', () => {
    let sent = false;
    repository.sendPasswordReset('phanlon@outlook.com').subscribe(() => (sent = true));

    const { request, variables } = expectPost('mutation RequestPasswordReset');
    expect(variables).toEqual({ input: { email: 'phanlon@outlook.com' } });
    request.flush({ data: { requestPasswordReset: true } });

    expect(sent).toBe(true);
  });
});
