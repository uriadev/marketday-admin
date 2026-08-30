import { Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { delay } from 'rxjs/operators';
import {
  EnquiryMessage,
  EnquirySource,
  EnquiryStatus,
  EnquirySummary,
  EnquiryThread,
  SupportCategory,
} from '../../models/support.model';
import { SupportRepository } from '../ports/support-repository';

/** The support team, for the assignee filter and the Assign menu. */
export const SUPPORT_AGENTS: readonly string[] = ['Áine Ryan', 'Dara Kelly', 'Niall Fahy'];

/** "3h", "2d" — how the inbox writes an age. */
function ageLabel(hours: number): string {
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

interface EnquirySeed {
  id: string;
  who: string;
  /** The rest of the thread header — "McNally Family Farm · Temple Bar". */
  about: string;
  subject: string;
  snippet: string;
  /** Full text of the message that opened the enquiry. */
  body: string;
  ageHours: number;
  source: EnquirySource;
  status: EnquiryStatus;
  category: SupportCategory;
  assignee: string | null;
  /** An internal note already on the thread, if there is one. */
  note?: { author: string; ageHours: number; body: string };
}

/** How each source describes itself in a message's meta line. */
const SOURCE_LABELS: Record<EnquirySource, string> = {
  'vendor-help': 'vendor help form',
  'contact-form': 'contact form',
  email: 'email',
};

/**
 * The inbox design 1j draws — its five rows, plus enough behind them to make
 * "9 open" true and the status filter worth having. Exported so tests assert
 * against the same queue the screen renders.
 */
const SEEDS: readonly EnquirySeed[] = [
  {
    id: 'enq-stall-hours',
    who: 'Tom McNally',
    about: 'McNally Family Farm · Temple Bar',
    subject: "Can't edit my stall opening hours",
    snippet: 'The save button greys out when I change Saturday…',
    body: "I'm trying to change our Saturday hours at Temple Bar to finish at 15:00 instead of 14:30, but the save button stays greyed out. Tried on the app and on the web.",
    ageHours: 3,
    source: 'vendor-help',
    status: 'open',
    category: SupportCategory.Bug,
    assignee: null,
    note: {
      author: 'Dara Kelly',
      ageHours: 1,
      body: "Stall hours are capped by the market's trading window (Temple Bar closes 14:30). Either the organiser extends the market or we tell Tom it's a hard limit.",
    },
  },
  {
    id: 'enq-refund',
    who: 'Niamh Brady',
    about: 'Shopper · Marlay Park',
    subject: 'Refund for a collected order',
    snippet: 'Half the punnets were mouldy when I got home…',
    body: 'Half the punnets were mouldy when I got home. I collected them at Marlay Park on Saturday and paid €18 for the box. Can I get a refund?',
    ageHours: 6,
    source: 'contact-form',
    status: 'open',
    category: SupportCategory.Orders,
    assignee: 'Dara Kelly',
  },
  {
    id: 'enq-add-market',
    who: 'Bantry Market',
    about: 'Organiser enquiry',
    subject: 'Add our market to the app',
    snippet: 'We run every Friday on the square, 40 stalls…',
    body: 'We run every Friday on the square, 40 stalls, and would like to be listed. Who do we talk to about getting set up before September?',
    ageHours: 26,
    source: 'email',
    status: 'open',
    category: SupportCategory.Other,
    assignee: null,
  },
  {
    id: 'enq-stall-payment',
    who: 'Gráinne Doyle',
    about: 'Ballymaloe Relish · Marlay Park',
    subject: 'Stall payment not showing',
    snippet: "Stall 12 paid by card but it isn't on the sheet…",
    body: "Stall 12 paid by card on Thursday but it isn't on the sheet, and the market page still says the fee is due. The bank shows it left our account.",
    ageHours: 52,
    source: 'vendor-help',
    status: 'open',
    category: SupportCategory.Payments,
    assignee: null,
  },
  {
    id: 'enq-collection-point',
    who: 'Peter Hanlon',
    about: 'Shopper · Marlay Park',
    subject: 'Collection point moved?',
    snippet: 'The map still shows the old gate at Marlay…',
    body: 'The map still shows the old gate at Marlay, but the stalls have moved to the far side. Which entrance should I use for a pre-order collection?',
    ageHours: 74,
    source: 'contact-form',
    status: 'open',
    category: SupportCategory.Other,
    assignee: 'Niall Fahy',
  },
  {
    id: 'enq-login',
    who: 'Cathal Byrne',
    about: 'McNally Family Farm · staff',
    subject: 'Cannot sign in to the vendor app',
    snippet: 'It keeps saying my code has expired…',
    body: 'It keeps saying my code has expired, but I request a new one and it does the same. I need to be on the stall Saturday morning.',
    ageHours: 9,
    source: 'vendor-help',
    status: 'open',
    category: SupportCategory.Account,
    assignee: null,
  },
  {
    id: 'enq-payout',
    who: 'Sheridans Cheese',
    about: 'Sheridans Cheese · Temple Bar',
    subject: 'Payout arrived short',
    snippet: 'Last week paid out €40 less than the orders…',
    body: 'Last week paid out €40 less than the orders came to. I have the order list if that helps — happy to send it on.',
    ageHours: 31,
    source: 'vendor-help',
    status: 'open',
    category: SupportCategory.Payments,
    assignee: 'Áine Ryan',
  },
  {
    id: 'enq-allergens',
    who: 'Máire Cronin',
    about: 'Shopper',
    subject: 'Allergen info on product pages',
    snippet: 'Some stalls list allergens and some do not…',
    body: 'Some stalls list allergens and some do not. Is that something vendors have to fill in, or is it optional?',
    ageHours: 44,
    source: 'contact-form',
    status: 'open',
    category: SupportCategory.Other,
    assignee: null,
  },
  {
    id: 'enq-press',
    who: 'Cork Food Press',
    about: 'Press enquiry',
    subject: 'Interview about the Midleton launch',
    snippet: 'Writing a piece on new markets this autumn…',
    body: 'Writing a piece on new markets this autumn and would love a few words about Midleton. Deadline is Friday week.',
    ageHours: 61,
    source: 'email',
    status: 'open',
    category: SupportCategory.Other,
    assignee: null,
  },
  {
    id: 'enq-receipt',
    who: 'Eoin Walsh',
    about: 'Shopper · Howth',
    subject: 'Receipt for a pre-order',
    snippet: 'Need a VAT receipt for last weekend…',
    body: 'Need a VAT receipt for last weekend for expenses. Can you email one across?',
    ageHours: 96,
    source: 'contact-form',
    status: 'resolved',
    category: SupportCategory.Orders,
    assignee: 'Dara Kelly',
  },
  {
    id: 'enq-map-pin',
    who: 'Kinsale Harbour Market',
    about: 'Organiser',
    subject: 'Map pin is in the wrong place',
    snippet: 'The pin sits in the water rather than the pier…',
    body: 'The pin sits in the water rather than the pier. Can you nudge it to the car park end?',
    ageHours: 120,
    source: 'email',
    status: 'resolved',
    category: SupportCategory.Bug,
    assignee: 'Áine Ryan',
  },
];

function toSummary(seed: EnquirySeed): EnquirySummary {
  return {
    id: seed.id,
    who: seed.who,
    subject: seed.subject,
    snippet: seed.snippet,
    age: ageLabel(seed.ageHours),
    ageHours: seed.ageHours,
    source: seed.source,
    status: seed.status,
    category: seed.category,
    assignee: seed.assignee,
  };
}

function toThread(seed: EnquirySeed): EnquiryThread {
  const messages: EnquiryMessage[] = [
    {
      id: `${seed.id}-opening`,
      author: seed.who,
      meta: `${seed.who} · ${ageLabel(seed.ageHours)} ago · ${SOURCE_LABELS[seed.source]}`,
      body: seed.body,
      kind: 'incoming',
    },
  ];
  if (seed.note) {
    messages.push({
      id: `${seed.id}-note`,
      author: seed.note.author,
      meta: `Internal note · ${seed.note.author.split(' ')[0]} · ${ageLabel(seed.note.ageHours)} ago`,
      body: seed.note.body,
      kind: 'note',
    });
  }
  return {
    id: seed.id,
    subject: seed.subject,
    meta: `${seed.who} · ${seed.about} · opened ${ageLabel(seed.ageHours)} ago`,
    status: seed.status,
    assignee: seed.assignee,
    replyTo: seed.who.split(' ')[0] ?? seed.who,
    messages,
  };
}

/** The inbox as the design's five rows plus the rest of the queue. */
export const ENQUIRIES_FIXTURE: readonly EnquirySummary[] = SEEDS.map(toSummary);

/** Design 1j's open thread, for tests and for the first row of the inbox. */
export const STALL_HOURS_THREAD: EnquiryThread = toThread(SEEDS[0]!);

@Injectable()
export class InMemorySupportRepository extends SupportRepository {
  /**
   * The queue, mutable for this session: replying, resolving and assigning are
   * real here, so the list and the thread stay in step the way they would
   * against a server.
   */
  private readonly summaries = new Map<string, EnquirySummary>(
    SEEDS.map((seed) => [seed.id, toSummary(seed)]),
  );
  private readonly threads = new Map<string, EnquiryThread>(
    SEEDS.map((seed) => [seed.id, toThread(seed)]),
  );

  override inbox(): Observable<readonly EnquirySummary[]> {
    return of([...this.summaries.values()]).pipe(delay(300));
  }

  override thread(id: string): Observable<EnquiryThread> {
    const thread = this.threads.get(id);
    if (!thread) {
      return throwError(() => new Error('That enquiry is no longer in the inbox.')).pipe(
        delay(300),
      );
    }
    return of(thread).pipe(delay(300));
  }

  override reply(id: string, body: string, internal: boolean): Observable<EnquiryMessage> {
    const thread = this.threads.get(id);
    if (!thread) {
      return throwError(() => new Error('That enquiry is no longer in the inbox.')).pipe(
        delay(300),
      );
    }
    const author = SUPPORT_AGENTS[0]!;
    const message: EnquiryMessage = {
      id: `${id}-${thread.messages.length}`,
      author,
      meta: internal
        ? `Internal note · ${author.split(' ')[0]} · just now`
        : `${author} · just now · replied by email`,
      body,
      kind: internal ? 'note' : 'reply',
    };
    this.threads.set(id, { ...thread, messages: [...thread.messages, message] });
    return of(message).pipe(delay(300));
  }

  override resolve(id: string): Observable<EnquirySummary> {
    return this.patch(id, { status: 'resolved' });
  }

  override assign(id: string, assignee: string | null): Observable<EnquirySummary> {
    return this.patch(id, { assignee });
  }

  private patch(id: string, patch: Partial<EnquirySummary>): Observable<EnquirySummary> {
    const summary = this.summaries.get(id);
    const thread = this.threads.get(id);
    if (!summary || !thread) {
      return throwError(() => new Error('That enquiry is no longer in the inbox.')).pipe(
        delay(300),
      );
    }
    const updated = { ...summary, ...patch };
    this.summaries.set(id, updated);
    this.threads.set(id, { ...thread, status: updated.status, assignee: updated.assignee });
    return of(updated).pipe(delay(300));
  }
}
