import { Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { delay } from 'rxjs/operators';
import { Account, AccountRole, SignUpBucket, UserRole } from '../../models/account.model';
import { AccountRepository } from '../ports/account-repository';
import { MARKETS_FIXTURE } from './in-memory-market-repository';
import { SUPPORT_AGENTS } from './in-memory-support-repository';
import { MARKET_LABELS, VENDORS_FIXTURE } from './in-memory-vendor-repository';

/** What the design's header counts. The list is padded out to reach it. */
const TOTAL_ACCOUNTS = 318;

/** The backend role behind each console role. */
const USER_ROLE: Record<AccountRole, UserRole> = {
  shopper: UserRole.Buyer,
  'vendor-staff': UserRole.Vendor,
  organiser: UserRole.Admin,
  support: UserRole.Admin,
  admin: UserRole.Admin,
};

/** "18m ago", "2h ago", "3d ago" — deterministic, so the table never shuffles. */
const ACTIVITY: readonly string[] = [
  '4m ago',
  '18m ago',
  '2h ago',
  '4h ago',
  '1d ago',
  '3d ago',
  '1w ago',
  '3w ago',
];

const SIGN_UP_YEARS: readonly [SignUpBucket, string][] = [
  ['last30', '11 August 2026'],
  ['thisYear', '3 February 2026'],
  ['thisYear', '19 May 2026'],
  ['earlier', '14 March 2021'],
  ['earlier', '8 September 2023'],
  ['earlier', '27 June 2024'],
];

function emailName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.|\.$/g, '');
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

type Seed = {
  name: string;
  email: string;
  role: AccountRole;
  attached: string;
  attachedLink?: readonly string[] | null;
  /** Index into {@link ACTIVITY} and {@link SIGN_UP_YEARS}. */
  spread: number;
  suspendedNote?: string;
};

/**
 * What each suspended account hid, so a restore has something to put back.
 * Exported so tests can stand a synchronous repository on the same state.
 */
export const SUSPENDED_IDENTITIES = new Map<string, { name: string; email: string }>();

function toAccount(seed: Seed, index: number): Account {
  const suspended = seed.suspendedNote !== undefined;
  const [bucket, signedUp] = SIGN_UP_YEARS[seed.spread % SIGN_UP_YEARS.length]!;
  const rank = seed.spread % ACTIVITY.length;
  const id = `acc-${3000 + index}`;
  if (suspended) SUSPENDED_IDENTITIES.set(id, { name: seed.name, email: seed.email });
  return {
    id,
    // A suspended account stops being a name in a list and becomes a number.
    name: suspended ? `Account #${3000 + index}` : seed.name,
    email: suspended ? 'hidden after suspension' : seed.email,
    role: seed.role,
    userRole: USER_ROLE[seed.role],
    attached: seed.attached,
    attachedLink: suspended ? null : (seed.attachedLink ?? null),
    lastActive: ACTIVITY[rank]!,
    lastActiveRank: rank,
    signedUp,
    signedUpBucket: bucket,
    status: suspended ? 'suspended' : 'active',
    suspendedNote: seed.suspendedNote ?? null,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   The six rows design 1i draws, then everyone else the platform actually has.
──────────────────────────────────────────────────────────────────────────── */

const DESIGNED: readonly Seed[] = [
  {
    name: 'Niamh Brady',
    email: 'niamh.brady@gmail.com',
    role: 'shopper',
    attached: '—',
    spread: 2,
  },
  {
    name: 'Tom McNally',
    email: 'tom@mcnallyfarm.ie',
    role: 'vendor-staff',
    attached: 'McNally Family Farm',
    attachedLink: ['/vendors', 'mcnally-family-farm'],
    spread: 1,
  },
  {
    name: 'Gráinne Doyle',
    email: 'grainne@templebarmarket.ie',
    role: 'organiser',
    attached: 'Temple Bar',
    attachedLink: ['/markets', 'temple-bar'],
    spread: 4,
  },
  {
    name: 'Dara Ó Sé',
    email: 'dara@marketday.ie',
    role: 'support',
    attached: 'MarketDay team',
    spread: 0,
  },
  {
    name: 'Rob Whelan',
    email: 'rob.whelan@gmail.com',
    role: 'shopper',
    attached: '—',
    spread: 3,
    suspendedNote: 'Repeated no-shows on collected pre-orders · suspended by Áine Ryan',
  },
  {
    name: 'Peter Hanlon',
    email: 'phanlon@outlook.com',
    role: 'shopper',
    attached: '—',
    spread: 5,
  },
];

/** The MarketDay team, taken from whoever answers the support inbox. */
function teamSeeds(): Seed[] {
  return [
    {
      name: SUPPORT_AGENTS[0] ?? 'Áine Ryan',
      email: 'aine@marketday.ie',
      role: 'admin',
      attached: 'MarketDay team',
      spread: 0,
    },
    ...SUPPORT_AGENTS.slice(1).map<Seed>((name, i) => ({
      name,
      email: `${emailName(name)}@marketday.ie`,
      role: 'support',
      attached: 'MarketDay team',
      spread: i + 1,
    })),
  ];
}

/** One organiser per market, so every market has someone who runs it. */
function organiserSeeds(): Seed[] {
  const names = [
    'Gráinne Doyle',
    'Fiachra Nolan',
    'Sorcha Devlin',
    'Cillian Barry',
    'Róisín Keane',
    'Emer Lynch',
    'Donal Mulcahy',
  ];
  return MARKETS_FIXTURE.slice(1).map<Seed>((market, i) => ({
    // Temple Bar's organiser is written out above, so start past her.
    name: names[(i + 1) % names.length]!,
    email: `${emailName(names[(i + 1) % names.length]!)}@${slugify(market.name)}.ie`,
    role: 'organiser',
    attached: MARKET_LABELS[market.slug] ?? market.name,
    attachedLink: ['/markets', market.slug],
    spread: i + 2,
  }));
}

/** Every name on every vendor's team gets the login they sign in with. */
function vendorStaffSeeds(): Seed[] {
  return VENDORS_FIXTURE.flatMap((vendor, v) =>
    vendor.staff
      // Tom McNally is written out above; don't list him twice.
      .filter((name) => !(vendor.slug === 'mcnally-family-farm' && name === 'Tom McNally'))
      .map<Seed>((name, i) => ({
        name,
        email: `${emailName(name)}@${slugify(vendor.name)}.ie`,
        role: 'vendor-staff',
        attached: vendor.name,
        attachedLink: ['/vendors', vendor.slug],
        spread: v + i,
      })),
  );
}

const FIRST_NAMES = [
  'Aoife',
  'Barry',
  'Ciara',
  'Declan',
  'Eimear',
  'Fionn',
  'Gemma',
  'Hugh',
  'Iseult',
  'Jack',
  'Katie',
  'Liam',
  'Maeve',
  'Nessa',
  'Oisín',
  'Paula',
  'Quentin',
  'Ruth',
  'Séamus',
  'Tara',
  'Ultan',
  'Vera',
  'Willow',
  'Yvonne',
];
const SURNAMES = [
  'Boylan',
  'Cassidy',
  'Dunne',
  'Egan',
  'Flanagan',
  'Gallagher',
  'Hurley',
  'Ivers',
  'Joyce',
  'Kavanagh',
  'Lenihan',
  'Moran',
  'Nugent',
  "O'Rourke",
  'Prendergast',
  'Quinlan',
  'Reilly',
  'Sheridan',
  'Tobin',
  'Vaughan',
];
const MAIL_HOSTS = ['gmail.com', 'outlook.com', 'eircom.net', 'yahoo.ie'];

/**
 * Shoppers, generated to reach the 318 the header reports. Deterministic, so
 * the list, its counts and the tests read the same on every run.
 */
function shopperSeeds(count: number): Seed[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => {
    // Walked rather than strided, so no two shoppers share a name.
    const name = `${FIRST_NAMES[i % FIRST_NAMES.length]} ${
      SURNAMES[Math.floor(i / FIRST_NAMES.length) % SURNAMES.length]
    }`;
    return {
      name,
      email: `${emailName(name)}${i}@${MAIL_HOSTS[i % MAIL_HOSTS.length]}`,
      role: 'shopper' as const,
      attached: '—',
      spread: i,
      // One more suspension out in the long tail, so the count is not a
      // property of the six rows the design happened to draw.
      ...(i === 12
        ? { suspendedNote: 'Chargeback fraud across three markets · suspended by Áine Ryan' }
        : {}),
    };
  });
}

/**
 * One login per person. The vendor fixture draws its teams from a shared pool
 * of names, so the same person staffs several vendors there — here they are one
 * account, at the first vendor they turn up in. The designed rows come first, so
 * a name the design pins to a shopper stays a shopper.
 */
function buildAccounts(): Account[] {
  const seen = new Set<string>();
  const unique = (seeds: readonly Seed[]) =>
    seeds.filter((seed) => {
      const key = seed.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const named = unique([...DESIGNED, ...teamSeeds(), ...organiserSeeds(), ...vendorStaffSeeds()]);
  // Generated wide, then cut to land exactly on the count the header reports.
  const shoppers = unique(shopperSeeds(TOTAL_ACCOUNTS)).slice(0, TOTAL_ACCOUNTS - named.length);
  return [...named, ...shoppers].map(toAccount);
}

export const ACCOUNTS_FIXTURE: readonly Account[] = buildAccounts();

@Injectable()
export class InMemoryAccountRepository extends AccountRepository {
  /**
   * The account list, mutable for this session: suspending and restoring are
   * real here, so the header's count and the row both move the way they would
   * against a server.
   */
  private readonly accounts = new Map<string, Account>(
    ACCOUNTS_FIXTURE.map((account) => [account.id, account]),
  );

  /** What a suspended account hid, seeded with the fixture's own suspensions. */
  private readonly hidden = new Map<string, { name: string; email: string }>(SUSPENDED_IDENTITIES);

  override list(): Observable<readonly Account[]> {
    return of([...this.accounts.values()]).pipe(delay(300));
  }

  override suspend(id: string, reason: string): Observable<Account> {
    const account = this.accounts.get(id);
    if (!account) return this.gone();
    if (account.status === 'suspended') {
      return throwError(() => new Error('That account is already suspended.')).pipe(delay(200));
    }
    if (reason.trim() === '') {
      return throwError(() => new Error('A suspension needs a reason.')).pipe(delay(200));
    }

    this.hidden.set(id, { name: account.name, email: account.email });
    const suspended: Account = {
      ...account,
      name: `Account #${id.replace('acc-', '')}`,
      email: 'hidden after suspension',
      attachedLink: null,
      status: 'suspended',
      suspendedNote: `${reason.trim()} · suspended just now`,
    };
    this.accounts.set(id, suspended);
    return of(suspended).pipe(delay(200));
  }

  override restore(id: string): Observable<Account> {
    const account = this.accounts.get(id);
    if (!account) return this.gone();
    if (account.status !== 'suspended') {
      return throwError(() => new Error('That account is not suspended.')).pipe(delay(200));
    }

    const was = this.hidden.get(id);
    const restored: Account = {
      ...account,
      name: was?.name ?? account.name,
      email: was?.email ?? account.email,
      status: 'active',
      suspendedNote: null,
    };
    this.accounts.set(id, restored);
    this.hidden.delete(id);
    return of(restored).pipe(delay(200));
  }

  private gone<T>(): Observable<T> {
    return throwError(() => new Error('That account no longer exists.')).pipe(delay(200));
  }
}
