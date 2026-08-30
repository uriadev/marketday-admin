import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Observable, of, throwError } from 'rxjs';
import { SupportRepository } from '../../core/api/ports/support-repository';
import {
  ENQUIRIES_FIXTURE,
  STALL_HOURS_THREAD,
} from '../../core/api/in-memory/in-memory-support-repository';
import { EnquiryMessage, EnquirySummary, EnquiryThread } from '../../core/models/support.model';
import { ConsoleChrome } from '../../layouts/console-layout/console-chrome';
import { Support } from './support';
import { SupportStore } from './support-store';
import { SupportThread } from './support-thread';
import { SupportThreadFacade } from './support-thread-facade';

/**
 * The fixture queue, mutable and answering synchronously. It keeps the real
 * adapter's semantics — a reply is appended, a resolve is reflected in both the
 * row and the thread — without its deliberate latency, which is what lets these
 * tests read as plainly as the screen behaves.
 */
class FakeSupportRepository extends SupportRepository {
  private readonly summaries = new Map(ENQUIRIES_FIXTURE.map((row) => [row.id, { ...row }]));
  private threads = new Map<string, EnquiryThread>([[STALL_HOURS_THREAD.id, STALL_HOURS_THREAD]]);

  override inbox(): Observable<readonly EnquirySummary[]> {
    return of([...this.summaries.values()]);
  }

  override thread(id: string): Observable<EnquiryThread> {
    const thread = this.threads.get(id);
    return thread ? of(thread) : throwError(() => new Error('No such enquiry.'));
  }

  override reply(id: string, body: string, internal: boolean): Observable<EnquiryMessage> {
    const thread = this.threads.get(id)!;
    const message: EnquiryMessage = {
      id: `${id}-${thread.messages.length}`,
      author: 'Áine Ryan',
      meta: internal ? 'Internal note · Áine · just now' : 'Áine Ryan · just now',
      body,
      kind: internal ? 'note' : 'reply',
    };
    this.threads.set(id, { ...thread, messages: [...thread.messages, message] });
    return of(message);
  }

  override resolve(id: string): Observable<EnquirySummary> {
    return this.patch(id, { status: 'resolved' });
  }

  override assign(id: string, assignee: string | null): Observable<EnquirySummary> {
    return this.patch(id, { assignee });
  }

  private patch(id: string, patch: Partial<EnquirySummary>): Observable<EnquirySummary> {
    const updated = { ...this.summaries.get(id)!, ...patch };
    this.summaries.set(id, updated);
    const thread = this.threads.get(id);
    if (thread) {
      this.threads.set(id, { ...thread, status: updated.status, assignee: updated.assignee });
    }
    return of(updated);
  }
}

function configure(component: unknown) {
  return TestBed.configureTestingModule({
    imports: [component as never],
    providers: [
      provideRouter([]),
      provideNoopAnimations(),
      ConsoleChrome,
      SupportStore,
      SupportThreadFacade,
      { provide: SupportRepository, useClass: FakeSupportRepository },
    ],
  }).compileComponents();
}

describe('Support inbox', () => {
  beforeEach(() => configure(Support));

  it('renders one queue with the source as a tag on each row', () => {
    const fixture = TestBed.createComponent(Support);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Inbox · 9 open');
    expect(text).toContain("Can't edit my stall opening hours");
    expect(text).toContain('Tom McNally');
    // All three sources land in the same list.
    expect(text).toContain('Vendor help');
    expect(text).toContain('Contact form');
    expect(text).toContain('Email');
  });

  it('tags an unassigned enquiry and one left past 48 hours', () => {
    const fixture = TestBed.createComponent(Support);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const stallHours = Array.from(host.querySelectorAll('.row')).find((row) =>
      row.textContent?.includes("Can't edit my stall opening hours"),
    );
    expect(stallHours?.textContent).toContain('Unassigned');

    const payment = Array.from(host.querySelectorAll('.row')).find((row) =>
      row.textContent?.includes('Stall payment not showing'),
    );
    expect(payment?.textContent).toContain('Over 48h');
  });

  it('shows open enquiries by default and hides the resolved ones', () => {
    const fixture = TestBed.createComponent(Support);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelectorAll('.row').length).toBe(9);
    expect(host.textContent).not.toContain('Receipt for a pre-order');
  });

  it('narrows to one source when the URL says so', () => {
    const fixture = TestBed.createComponent(Support);
    fixture.componentRef.setInput('source', 'email');
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('Add our market to the app');
    expect(host.textContent).not.toContain("Can't edit my stall opening hours");
    // The header count is still the whole queue.
    expect(host.textContent).toContain('Inbox · 9 open');
  });

  it('offers a way out when the filters match nothing', () => {
    const fixture = TestBed.createComponent(Support);
    fixture.componentRef.setInput('q', 'no such enquiry');
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Nothing matches those filters');
    expect(text).toContain('Clear filters');
  });
});

describe('Support thread', () => {
  beforeEach(() => configure(SupportThread));

  function open(id = 'enq-stall-hours') {
    const fixture = TestBed.createComponent(SupportThread);
    fixture.componentRef.setInput('enquiryId', id);
    fixture.detectChanges();
    return fixture;
  }

  it('renders the enquiry and the internal note beside it', () => {
    const fixture = open();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain("Can't edit my stall opening hours");
    expect(text).toContain('Tom McNally · McNally Family Farm · Temple Bar · opened 3h ago');
    expect(text).toContain('the save button stays greyed out');
    expect(text).toContain('Internal note · Dara');
    expect(text).toContain('Temple Bar closes 14:30');
  });

  it('draws an internal note differently from what the person wrote in', () => {
    const fixture = open();

    const host = fixture.nativeElement as HTMLElement;
    const bubbles = Array.from(host.querySelectorAll('.bubble'));
    expect(bubbles.length).toBe(2);
    expect(bubbles[0]?.classList.contains('bubble--note')).toBe(false);
    expect(bubbles[1]?.classList.contains('bubble--note')).toBe(true);
  });

  it('will not send an empty reply', () => {
    const fixture = open();
    const facade = TestBed.inject(SupportThreadFacade);
    const reply = vi.spyOn(facade, 'reply');

    fixture.componentInstance['send']();

    expect(reply).not.toHaveBeenCalled();
  });

  it('appends a sent reply to the thread and clears the box', () => {
    const fixture = open();
    const component = fixture.componentInstance;

    component['draft'].set('Extending the market is the only way to allow 15:00.');
    component['send']();
    fixture.detectChanges();

    expect(component['draft']()).toBe('');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Extending the market is the only way to allow 15:00.');
  });

  it('says who will read what is being written', () => {
    const fixture = open();
    const component = fixture.componentInstance;

    expect(component['sendHint']()).toBe('Sends by email and in-app notification');
    expect(component['placeholder']()).toBe('Write a reply to Tom…');

    component['mode'].set('note');
    fixture.detectChanges();

    expect(component['sendHint']()).toBe('Only the support team sees this');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Add note');
  });

  it('adds a saved reply to what is already written rather than replacing it', () => {
    const fixture = open();
    const component = fixture.componentInstance;

    component['draft'].set('Hi Tom,');
    component['insertSavedReply']('Thanks for getting in touch.');

    expect(component['draft']()).toBe('Hi Tom,\n\nThanks for getting in touch.');
  });

  it('resolving updates the thread and the row it came from', () => {
    const fixture = open();
    const store = TestBed.inject(SupportStore);
    store.load();

    fixture.componentInstance['facade'].resolve();
    fixture.detectChanges();

    expect(fixture.componentInstance['thread']()?.status).toBe('resolved');
    expect(store.items().find((e) => e.id === 'enq-stall-hours')?.status).toBe('resolved');
    expect(store.openCount()).toBe(8);
  });

  it('assigning updates the thread and the row it came from', () => {
    const fixture = open();
    const store = TestBed.inject(SupportStore);
    store.load();

    fixture.componentInstance['facade'].assign('Niall Fahy');
    fixture.detectChanges();

    expect(fixture.componentInstance['thread']()?.assignee).toBe('Niall Fahy');
    expect(store.items().find((e) => e.id === 'enq-stall-hours')?.assignee).toBe('Niall Fahy');
  });
});
