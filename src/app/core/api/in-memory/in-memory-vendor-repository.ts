import { Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { delay } from 'rxjs/operators';
import {
  VendorBadge,
  VendorDetail,
  VendorInvite,
  VendorInviteSummary,
  VendorMemberRole,
  VendorMembership,
  VendorProfile,
  VendorProfilePatch,
  VendorStaffMember,
  VendorStaffNote,
  VendorStanding,
  VendorSummary,
} from '../../models/vendor.model';
import { VendorRepository } from '../ports/vendor-repository';
import { MARKETS_FIXTURE, MARKET_LABELS, slugForLabel } from './market-fixture';

/** Full market name for a short label — "Temple Bar" → "Temple Bar Food Market". */
function marketName(label: string): string {
  const slug = slugForLabel(label);
  return MARKETS_FIXTURE.find((market) => market.slug === slug)?.name ?? label;
}

/** The schedule half of a market's `when` line — "Saturdays 09:00–14:30". */
function marketSchedule(label: string): string {
  const slug = slugForLabel(label);
  const market = MARKETS_FIXTURE.find((candidate) => candidate.slug === slug);
  return market?.when.split(' · ')[1] ?? 'Market day';
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Staff names the fixture draws on for any vendor without a hand-written team. */
const STAFF_POOL = [
  'Niamh Brady',
  'Dara Kelly',
  'Gráinne Doyle',
  'Peter Hanlon',
  'Aoife Nolan',
  'Eoin Walsh',
  'Síle Fitzgerald',
  'Ruairí Behan',
  'Máire Cronin',
  'Fergal Hayes',
  'Orla Devine',
  'Colm Traynor',
];

/** Deterministic, so the directory reads the same on every run and in tests. */
function staffFor(index: number, count: number): string[] {
  return Array.from(
    { length: count },
    (_, i) => STAFF_POOL[(index * 5 + i) % STAFF_POOL.length] ?? 'Staff member',
  );
}

const STANDING_LABELS: Record<VendorStanding, string | null> = {
  trading: 'Trading',
  'fee-unpaid': 'Fee unpaid ×1',
  paused: 'Paused',
  // A pending application shows a Review button in place of a badge; an
  // invitation has nothing to decide, so it keeps one.
  pending: null,
  invited: 'Invitation pending',
};

/** How long an invitation link lives, and when the nudge goes out. */
const INVITE_POLICY = { linkValidDays: 14, reminderAfterDays: 5 };

/** Invitations already sent this month, before this session's own. */
const INVITES_SENT_THIS_MONTH = 14;

/** A row before its derived fields are filled in. */
interface VendorSeed {
  name: string;
  /** "Vegetables & eggs", "Cheese" — the first half of the row's meta line. */
  trade: string;
  /** "since 2021", or the application's age for a vendor that isn't in yet. */
  tenure: string;
  markets: readonly string[];
  appliedLabel?: string;
  standing: VendorStanding;
  staffCount: number;
  /** Overrides the generated team, where later screens name the people. */
  staff?: readonly string[];
}

/** The six rows design 1a draws, with its markets mapped onto the real seven. */
const DESIGNED: readonly VendorSeed[] = [
  {
    name: 'McNally Family Farm',
    trade: 'Vegetables & eggs',
    tenure: 'since 2021',
    markets: ['Temple Bar', 'Marlay Park', 'Howth'],
    appliedLabel: '+1 applied',
    standing: 'trading',
    staffCount: 5,
    staff: ['Tom McNally', 'Bríd McNally', 'Cathal Byrne', 'Lucia Marín', 'Sam Okafor'],
  },
  {
    name: 'Ballymaloe Relish',
    trade: 'Preserves',
    tenure: 'since 2019',
    markets: ['Temple Bar', 'Marlay Park', 'Midleton', 'Douglas'],
    standing: 'fee-unpaid',
    staffCount: 6,
  },
  {
    name: 'Sheridans Cheese',
    trade: 'Cheese',
    tenure: 'since 2018',
    markets: ['Temple Bar', 'Howth'],
    standing: 'trading',
    staffCount: 3,
  },
  {
    name: 'Nine Bean Rows',
    trade: 'Bakery',
    tenure: 'applied 2 days ago',
    markets: [],
    appliedLabel: 'Temple Bar · applied',
    standing: 'pending',
    staffCount: 1,
  },
  {
    name: 'Kish Fish',
    trade: 'Fish',
    tenure: 'since 2020',
    markets: ['Temple Bar'],
    standing: 'trading',
    staffCount: 2,
  },
  {
    name: 'Wild Irish Foragers',
    trade: 'Preserves',
    tenure: 'since 2022',
    markets: ['Marlay Park'],
    standing: 'paused',
    staffCount: 1,
  },
];

/**
 * The rest of the directory. The design shows six rows and claims 86; a fixture
 * that small would make the paginator ornamental, so the tail is written out —
 * enough to page through, and covering all seven markets.
 */
const REST: readonly VendorSeed[] = [
  {
    name: 'Coolea Cheese Co.',
    trade: 'Cheese',
    tenure: 'since 2017',
    markets: ['Temple Bar', 'Midleton'],
    standing: 'trading',
    staffCount: 4,
  },
  {
    name: 'Toonsbridge Dairy',
    trade: 'Dairy',
    tenure: 'since 2016',
    markets: ['Midleton', 'Douglas', 'Kinsale'],
    standing: 'trading',
    staffCount: 7,
  },
  {
    name: 'Baked in Bray',
    trade: 'Bakery',
    tenure: 'since 2019',
    markets: ['Marlay Park'],
    standing: 'fee-unpaid',
    staffCount: 3,
  },
  {
    name: 'Ballylickey Bakehouse',
    trade: 'Bakery',
    tenure: 'since 2021',
    markets: ['Bantry', 'Kinsale'],
    standing: 'trading',
    staffCount: 2,
  },
  {
    name: 'Sliabh Luachra Honey',
    trade: 'Honey',
    tenure: 'since 2020',
    markets: ['Howth', 'Midleton'],
    standing: 'trading',
    staffCount: 1,
  },
  {
    name: 'Blackwater Bakehouse',
    trade: 'Bakery',
    tenure: 'applied 3 days ago',
    markets: [],
    appliedLabel: 'Marlay Park · applied',
    standing: 'pending',
    staffCount: 2,
  },
  {
    name: 'Cork Coffee Roasters',
    trade: 'Coffee',
    tenure: 'since 2015',
    markets: ['Douglas', 'Midleton', 'Kinsale'],
    standing: 'trading',
    staffCount: 8,
  },
  {
    name: 'Gubbeen Farmhouse',
    trade: 'Cheese & charcuterie',
    tenure: 'since 2014',
    markets: ['Bantry', 'Douglas'],
    standing: 'trading',
    staffCount: 5,
  },
  {
    name: 'Arun Spice Kitchen',
    trade: 'Prepared food',
    tenure: 'since 2023',
    markets: ['Temple Bar'],
    standing: 'trading',
    staffCount: 3,
  },
  {
    name: 'Velvet Cloud',
    trade: 'Sheep dairy',
    tenure: 'since 2018',
    markets: ['Marlay Park', 'Howth'],
    standing: 'trading',
    staffCount: 2,
  },
  {
    name: 'Dunmore East Fish',
    trade: 'Fish',
    tenure: 'since 2019',
    markets: ['Kinsale'],
    standing: 'paused',
    staffCount: 4,
  },
  {
    name: 'Glenilen Farm',
    trade: 'Dairy',
    tenure: 'since 2013',
    markets: ['Bantry', 'Midleton', 'Douglas'],
    standing: 'trading',
    staffCount: 6,
  },
  {
    name: 'The Wooden Spoon',
    trade: 'Preserves',
    tenure: 'since 2022',
    markets: ['Douglas'],
    standing: 'fee-unpaid',
    staffCount: 1,
  },
  {
    name: 'Ballyhoura Mushrooms',
    trade: 'Mushrooms',
    tenure: 'since 2021',
    markets: ['Midleton', 'Temple Bar'],
    standing: 'trading',
    staffCount: 3,
  },
  {
    name: 'Sunflower Bakery',
    trade: 'Bakery',
    tenure: 'applied 5 days ago',
    markets: [],
    appliedLabel: 'Howth · applied',
    standing: 'pending',
    staffCount: 1,
  },
  {
    name: 'Union Hall Smoked Fish',
    trade: 'Fish',
    tenure: 'since 2017',
    markets: ['Bantry', 'Kinsale', 'Douglas'],
    standing: 'trading',
    staffCount: 4,
  },
  {
    name: 'Kilbeggan Organic',
    trade: 'Grains',
    tenure: 'since 2020',
    markets: ['Marlay Park'],
    standing: 'trading',
    staffCount: 2,
  },
  {
    name: 'Ardsallagh Goats',
    trade: 'Cheese',
    tenure: 'since 2016',
    markets: ['Midleton', 'Douglas'],
    standing: 'trading',
    staffCount: 3,
  },
  {
    name: 'Rossmore Oysters',
    trade: 'Shellfish',
    tenure: 'since 2018',
    markets: ['Kinsale'],
    standing: 'trading',
    staffCount: 2,
  },
  {
    name: 'The Chocolate Garden',
    trade: 'Confectionery',
    tenure: 'since 2022',
    markets: ['Temple Bar', 'Marlay Park'],
    standing: 'paused',
    staffCount: 2,
  },
  {
    name: 'Highbank Orchards',
    trade: 'Orchard produce',
    tenure: 'since 2015',
    markets: ['Howth', 'Temple Bar'],
    standing: 'trading',
    staffCount: 5,
  },
  {
    name: 'Little Milk Company',
    trade: 'Cheese',
    tenure: 'since 2019',
    markets: ['Douglas'],
    standing: 'trading',
    staffCount: 3,
  },
  {
    name: 'Slow Grown Greens',
    trade: 'Vegetables',
    tenure: 'since 2023',
    markets: ['Bantry'],
    standing: 'fee-unpaid',
    staffCount: 1,
  },
  {
    name: 'Achill Island Sea Salt',
    trade: 'Pantry',
    tenure: 'since 2017',
    markets: ['Howth', 'Kinsale', 'Marlay Park'],
    standing: 'trading',
    staffCount: 4,
  },
];

function toSummary(seed: VendorSeed, index: number): VendorSummary {
  const slug = slugify(seed.name);
  const staff = seed.staff ?? staffFor(index, seed.staffCount);
  return {
    id: `vnd-${slug}`,
    slug,
    name: seed.name,
    meta: `${seed.trade} · ${seed.tenure}`,
    markets: seed.markets,
    appliedLabel: seed.appliedLabel ?? null,
    staff,
    staffCount: staff.length,
    standing: seed.standing,
    standingLabel: STANDING_LABELS[seed.standing],
  };
}

/**
 * The platform directory (design 1a): 30 vendors across all seven markets,
 * four of them with an application waiting on a decision — which is what the
 * screen's summary line and its "Applications" chip claim. Exported so tests
 * assert against the same rows the screen renders.
 */
export const VENDORS_FIXTURE: readonly VendorSummary[] = [...DESIGNED, ...REST].map(toSummary);

const MCNALLY_MEMBERSHIPS: readonly VendorMembership[] = [
  {
    id: 'mem-temple-bar',
    market: 'Temple Bar Food Market',
    marketSlug: 'temple-bar',
    badges: [{ label: 'Trading', tone: 'positive' }],
    detail: 'Saturdays 09:00–14:30 · Stall A7 · member since March 2021',
    facts: [
      { label: 'Fee paid · €35 · 12 Aug', emphasis: false },
      { label: 'Next day Sat 22 Aug', emphasis: false },
      { label: '3 staff can work here', emphasis: false },
    ],
    paused: false,
  },
  {
    id: 'mem-marlay-park',
    market: 'Marlay Park Market',
    marketSlug: 'marlay-park',
    badges: [
      { label: 'Trading', tone: 'positive' },
      { label: 'Fee due', tone: 'warn' },
    ],
    detail: 'Saturdays 10:00–16:00 · Stall 12 · member since June 2024',
    facts: [
      { label: '€35 due 20 Aug', emphasis: true },
      { label: 'Next day Sat 22 Aug', emphasis: false },
      { label: '4 staff can work here', emphasis: false },
    ],
    paused: false,
  },
  {
    id: 'mem-howth',
    market: 'Howth Harbour Market',
    marketSlug: 'howth-harbour',
    badges: [{ label: 'Paused for August', tone: 'muted' }],
    detail: 'Sat–Sun 09:00–17:00 · Stall 4 · member since November 2021 · returns 6 September',
    facts: [
      { label: 'No fee while paused', emphasis: false },
      { label: '2 staff can work here', emphasis: false },
    ],
    paused: true,
  },
];

/** McNally's team, exactly as design 1c lists it. */
const MCNALLY_STAFF: readonly VendorStaffMember[] = [
  {
    id: 'stf-tom-mcnally',
    name: 'Tom McNally',
    role: 'Owner · account holder',
    memberRole: VendorMemberRole.Owner,
    email: 'tom@mcnallyfarm.ie',
    phone: '087 244 1180',
    allMarkets: true,
    markets: [],
    managesStaff: true,
    pending: false,
  },
  {
    id: 'stf-brid-mcnally',
    name: 'Bríd McNally',
    role: 'Manager',
    memberRole: VendorMemberRole.Owner,
    email: 'brid@mcnallyfarm.ie',
    phone: '086 771 0342',
    allMarkets: true,
    markets: [],
    managesStaff: true,
    pending: false,
  },
  {
    id: 'stf-cathal-byrne',
    name: 'Cathal Byrne',
    role: 'Stallholder',
    memberRole: VendorMemberRole.Staff,
    email: 'cathal.byrne@gmail.com',
    phone: '085 209 6614',
    allMarkets: false,
    markets: ['Temple Bar', 'Marlay Park'],
    managesStaff: false,
    pending: false,
  },
  {
    id: 'stf-lucia-marin',
    name: 'Lucia Marín',
    role: 'Stallholder',
    memberRole: VendorMemberRole.Staff,
    email: 'lucia.marin@gmail.com',
    phone: '089 118 2277',
    allMarkets: false,
    markets: ['Marlay Park'],
    managesStaff: false,
    pending: false,
  },
  {
    id: 'stf-sam-okafor',
    name: 'Sam Okafor',
    role: 'Stallholder · invited 2 days ago',
    memberRole: VendorMemberRole.Staff,
    email: 'sam.okafor@gmail.com',
    phone: 'No phone yet',
    allMarkets: false,
    markets: ['Temple Bar'],
    managesStaff: false,
    pending: true,
  },
];

const MCNALLY_STAFF_NOTES: readonly VendorStaffNote[] = [
  {
    id: 'note-who',
    title: 'Who can change this list',
    body: 'Tom and Bríd manage staff from the vendor app. Platform admins can add, remove and re-scope anyone here — every change is written to the vendor’s Activity tab.',
  },
  {
    id: 'note-leaving',
    title: 'Leaving a market',
    body: 'If the vendor drops Howth, staff scoped only to it keep their account but lose access on the closing date. Nobody is deleted by a membership change.',
  },
];

/** The vendor design 1b draws, with its own copy rather than derived text. */
export const MCNALLY_DETAIL: VendorDetail = {
  id: 'vnd-mcnally-family-farm',
  slug: 'mcnally-family-farm',
  name: 'McNally Family Farm',
  meta: 'Vegetables & eggs · Ballyboughal, Co. Dublin · Tom McNally · 087 244 1180 · on MarketDay since March 2021',
  badges: [
    { label: 'Trading at 3 markets', tone: 'positive' },
    { label: '1 application', tone: 'warn' },
  ],
  marketCount: 3,
  staffCount: 5,
  membershipCount: 4,
  productCount: 14,
  pendingApplication: {
    id: 'app-douglas',
    title: 'Applied to Douglas Village Market',
    body: 'Submitted 3 days ago by Tom McNally. Wants a 3m pitch with power, fortnightly from 6 September.',
  },
  memberships: MCNALLY_MEMBERSHIPS,
  staff: MCNALLY_STAFF,
  staffNotes: MCNALLY_STAFF_NOTES,
  stats: [
    { label: 'Markets', value: '3' },
    { label: 'Staff', value: '5' },
    { label: 'Fees due', value: '€35' },
    { label: 'Days booked', value: '64' },
  ],
  nextDays: [
    {
      id: 'day-temple-bar',
      when: 'Sat 22 Aug · Temple Bar A7',
      note: 'Setup 06:30 · Bríd and Cathal on the stall',
    },
    {
      id: 'day-marlay-park',
      when: 'Sat 22 Aug · Marlay Park 12',
      note: 'Setup 08:00 · Lucia on the stall',
    },
  ],
  documents: [
    { id: 'doc-liability', label: 'Public liability · to Feb 2027', state: 'valid' },
    { id: 'doc-food-safety', label: 'Food safety cert · to Jan 2027', state: 'valid' },
    { id: 'doc-organic', label: 'Organic cert · renews 30 Sep', state: 'expiring' },
  ],
  suspendNote: 'Removes them from all 3 markets and signs out all 5 staff accounts.',
};

/**
 * How many products a vendor without a hand-written list carries. Kept in step
 * with the generic seeds in `in-memory-product-repository.ts` — the tab badge
 * and the tab itself have to agree.
 */
const GENERIC_PRODUCT_COUNT = 6;

/** Stall fee per market day, in euro — the same figure the market screens use. */
const STALL_FEE = 35;

/** "Bríd McNally" → "brid.mcnally" — accents stripped, so emails read plainly. */
function emailName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, '.');
}

/** Deterministic and obviously placeholder — no real number can collide. */
function phoneFor(index: number): string {
  const digits = `${(index * 7919 + 1000000) % 10000000}`.padStart(7, '0');
  return `08${(index % 4) + 3} ${digits.slice(0, 3)} ${digits.slice(3)}`;
}

/**
 * Turns a vendor's staff names into a team: the first person owns the account
 * and sees every market, the rest are stallholders scoped to one market each,
 * cycling through the markets the vendor actually trades at.
 */
function buildStaff(vendor: VendorSummary): VendorStaffMember[] {
  return vendor.staff.map((name, i) => {
    const owner = i === 0;
    const market = vendor.markets[(i - 1) % Math.max(1, vendor.markets.length)];
    return {
      id: `stf-${vendor.slug}-${emailName(name).replace(/\./g, '-')}`,
      name,
      role: owner ? 'Owner · account holder' : 'Stallholder',
      memberRole: owner ? VendorMemberRole.Owner : VendorMemberRole.Staff,
      email: `${emailName(name)}@${vendor.slug}.ie`,
      phone: phoneFor(i + vendor.name.length),
      allMarkets: owner,
      markets: owner || !market ? [] : [market],
      managesStaff: owner,
      pending: false,
    };
  });
}

/** The vendor design 2a edits, in its own copy rather than derived text. */
export const MCNALLY_PROFILE: VendorProfile = {
  reference: 'v_1042',
  tradingName: 'McNally Family Farm',
  registeredName: 'McNally Produce Ltd',
  category: 'Vegetables & eggs',
  vatNumber: 'IE 4728116 F',
  description:
    'Twelve acres in Ballyboughal, worked by the same family since 1974. Seasonal vegetables cut the morning of the market, free-range eggs, and whatever the polytunnel gives us in jars.',
  produceTags: ['Vegetables', 'Free-range eggs', 'Jams & preserves', 'Organic', 'Pre-order'],
  contactName: 'Tom McNally',
  phone: '087 244 1180',
  email: 'tom@mcnallyfarm.ie',
  website: 'mcnallyfarm.ie',
  address: 'Grallagh, Ballyboughal, Co. Dublin, A41 KV62',
  photos: [],
  created: 'Created 14 March 2021 by Gráinne Doyle',
  lastEdited: 'Last edited 6 days ago',
  lastEditedBy: 'by Tom McNally, in the vendor app',
};

/**
 * A profile for any other vendor in the directory, so every record opens. The
 * blanks are honestly blank — a vendor who never filled in a VAT number has an
 * empty field, not invented text.
 */
function buildProfile(vendor: VendorSummary, index: number): VendorProfile {
  const owner = vendor.staff[0] ?? 'The owner';
  const trade = vendor.meta.split(' · ')[0] ?? 'Craft & other';
  return {
    reference: `v_${1000 + index}`,
    tradingName: vendor.name,
    registeredName: '',
    category: trade,
    vatNumber: '',
    description: '',
    produceTags: [],
    contactName: owner,
    phone: phoneFor(index),
    email: `${emailName(owner)}@${slugify(vendor.name)}.ie`,
    website: '',
    address: '',
    photos: [],
    created: `Created by ${owner}`,
    lastEdited: 'Not edited since it was created',
    lastEditedBy: '',
  };
}

/**
 * Builds a detail screen for any vendor in the directory, so every row opens.
 * McNally is hand-written above; the rest are derived from their summary.
 */
function buildDetail(vendor: VendorSummary): VendorDetail {
  const owed = vendor.standing === 'fee-unpaid' ? STALL_FEE : 0;
  const paused = vendor.standing === 'paused';

  const memberships = vendor.markets.map<VendorMembership>((label, i) => {
    const feeDue = owed > 0 && i === 0;
    return {
      id: `mem-${slugForLabel(label) ?? slugify(label)}`,
      market: marketName(label),
      marketSlug: slugForLabel(label) ?? slugify(label),
      badges: paused
        ? [{ label: 'Paused', tone: 'muted' as const }]
        : [
            { label: 'Trading', tone: 'positive' as const },
            ...(feeDue ? [{ label: 'Fee due', tone: 'warn' as const }] : []),
          ],
      detail: `${marketSchedule(label)} · member since ${2015 + ((i + vendor.name.length) % 9)}`,
      facts: [
        feeDue
          ? { label: `€${STALL_FEE} due 20 Aug`, emphasis: true }
          : { label: `Fee paid · €${STALL_FEE} · 12 Aug`, emphasis: false },
        {
          label: `${Math.max(1, vendor.staff.length - i)} staff can work here`,
          emphasis: false,
        },
      ],
      paused,
    };
  });

  const badges: VendorBadge[] = [];
  if (memberships.length > 0) {
    badges.push({
      label: `Trading at ${memberships.length} ${memberships.length === 1 ? 'market' : 'markets'}`,
      tone: paused ? 'muted' : 'positive',
    });
  }
  if (vendor.appliedLabel) {
    badges.push({ label: '1 application', tone: 'warn' });
  }

  const application = vendor.appliedLabel
    ? {
        id: `app-${vendor.slug}`,
        title: `Applied to ${vendor.appliedLabel.split(' · ')[0] ?? 'a market'}`,
        body: `Submitted by ${vendor.staff[0] ?? 'the owner'}. Waiting on a decision from the market organiser.`,
      }
    : null;

  return {
    id: vendor.id,
    slug: vendor.slug,
    name: vendor.name,
    meta: `${vendor.meta} · ${vendor.staff[0] ?? 'Owner'}`,
    badges,
    marketCount: memberships.length,
    staffCount: vendor.staff.length,
    membershipCount: memberships.length + (application ? 1 : 0),
    productCount: GENERIC_PRODUCT_COUNT,
    pendingApplication: application,
    memberships,
    staff: buildStaff(vendor),
    staffNotes: [
      {
        id: 'note-who',
        title: 'Who can change this list',
        body: `${vendor.staff[0] ?? 'The owner'} manages staff from the vendor app. Platform admins can add, remove and re-scope anyone here — every change is written to the vendor’s Activity tab.`,
      },
      {
        id: 'note-leaving',
        title: 'Leaving a market',
        body: `If the vendor drops ${
          vendor.markets[vendor.markets.length - 1] ?? 'a market'
        }, staff scoped only to it keep their account but lose access on the closing date. Nobody is deleted by a membership change.`,
      },
    ],
    stats: [
      { label: 'Markets', value: `${memberships.length}` },
      { label: 'Staff', value: `${vendor.staff.length}` },
      { label: 'Fees due', value: `€${owed}` },
      { label: 'Days booked', value: `${memberships.length * 12}` },
    ],
    nextDays: memberships.slice(0, 2).map((membership, i) => ({
      id: `day-${membership.marketSlug}`,
      when: `Sat 22 Aug · ${MARKET_LABELS[membership.marketSlug] ?? membership.market}`,
      note: `${vendor.staff[i] ?? 'The owner'} on the stall`,
    })),
    documents: [
      { id: 'doc-liability', label: 'Public liability · to Feb 2027', state: 'valid' },
      { id: 'doc-food-safety', label: 'Food safety cert · to Jan 2027', state: 'valid' },
    ],
    suspendNote: `Removes them from ${
      memberships.length === 1 ? 'their market' : `all ${memberships.length} markets`
    } and signs out all ${vendor.staff.length} staff ${
      vendor.staff.length === 1 ? 'account' : 'accounts'
    }.`,
  };
}

@Injectable()
export class InMemoryVendorRepository extends VendorRepository {
  /**
   * Vendors invited this session, keyed by slug. Bound as a singleton in
   * `api.providers.ts`, so an invitation sent on design 1n is in the directory
   * when 1a next loads — which is what makes the flow real rather than a form
   * that swallows its input.
   */
  private readonly invited = new Map<string, VendorSummary>();

  override list(): Observable<readonly VendorSummary[]> {
    return of([...VENDORS_FIXTURE, ...this.invited.values()]).pipe(delay(300));
  }

  override detail(slug: string): Observable<VendorDetail> {
    if (slug === MCNALLY_DETAIL.slug) {
      return of(MCNALLY_DETAIL).pipe(delay(300));
    }
    const vendor =
      VENDORS_FIXTURE.find((candidate) => candidate.slug === slug) ?? this.invited.get(slug);
    if (!vendor) {
      return throwError(() => new Error(`No vendor matches “${slug}”.`)).pipe(delay(300));
    }
    return of(buildDetail(vendor)).pipe(delay(300));
  }

  /**
   * Profiles edited this session, keyed by slug — a save on design 2a is real
   * here, so navigating away and back shows what was written rather than the
   * seed again.
   */
  private readonly profiles = new Map<string, VendorProfile>();

  override profile(slug: string): Observable<VendorProfile> {
    const edited = this.profiles.get(slug);
    if (edited) return of(edited).pipe(delay(300));

    if (slug === MCNALLY_DETAIL.slug) return of(MCNALLY_PROFILE).pipe(delay(300));

    const index = VENDORS_FIXTURE.findIndex((candidate) => candidate.slug === slug);
    const vendor = index >= 0 ? VENDORS_FIXTURE[index] : this.invited.get(slug);
    if (!vendor) {
      return throwError(() => new Error(`No vendor matches “${slug}”.`)).pipe(delay(300));
    }
    return of(buildProfile(vendor, index >= 0 ? index : VENDORS_FIXTURE.length)).pipe(delay(300));
  }

  override saveProfile(slug: string, patch: VendorProfilePatch): Observable<VendorProfile> {
    const current = this.profiles.get(slug) ?? this.seedProfile(slug);
    if (!current) {
      return throwError(() => new Error(`No vendor matches “${slug}”.`)).pipe(delay(300));
    }
    if (patch.tradingName.trim() === '') {
      return throwError(() => new Error('A vendor needs a trading name.')).pipe(delay(300));
    }
    const saved: VendorProfile = {
      ...current,
      ...patch,
      lastEdited: 'Last edited just now',
      lastEditedBy: 'by you, in the admin console',
    };
    this.profiles.set(slug, saved);
    return of(saved).pipe(delay(400));
  }

  /** The unedited profile for a slug, or `null` when no vendor has it. */
  private seedProfile(slug: string): VendorProfile | null {
    if (slug === MCNALLY_DETAIL.slug) return MCNALLY_PROFILE;
    const index = VENDORS_FIXTURE.findIndex((candidate) => candidate.slug === slug);
    const vendor = index >= 0 ? VENDORS_FIXTURE[index] : this.invited.get(slug);
    return vendor ? buildProfile(vendor, index >= 0 ? index : VENDORS_FIXTURE.length) : null;
  }

  override inviteSummary(): Observable<VendorInviteSummary> {
    return of({
      sentThisMonth: INVITES_SENT_THIS_MONTH + this.invited.size,
      ...INVITE_POLICY,
    }).pipe(delay(120));
  }

  override invite(invite: VendorInvite): Observable<VendorSummary> {
    const slug = slugify(invite.businessName);
    if (!slug) {
      return throwError(() => new Error('An invitation needs a business name.')).pipe(delay(300));
    }
    if (VENDORS_FIXTURE.some((vendor) => vendor.slug === slug) || this.invited.has(slug)) {
      return throwError(() => new Error(`${invite.businessName} is already on MarketDay.`)).pipe(
        delay(300),
      );
    }

    const summary: VendorSummary = {
      id: `vnd-${slug}`,
      slug,
      name: invite.businessName,
      meta: `${invite.trade} · invited just now`,
      // They cannot trade anywhere until they sign up and are approved.
      markets: [],
      appliedLabel: null,
      staff: invite.contactName ? [invite.contactName] : [],
      staffCount: invite.contactName ? 1 : 0,
      standing: 'invited',
      standingLabel: STANDING_LABELS.invited,
    };
    this.invited.set(slug, summary);
    return of(summary).pipe(delay(300));
  }
}
