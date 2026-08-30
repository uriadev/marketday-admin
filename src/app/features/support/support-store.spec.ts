import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { SupportRepository } from '../../core/api/ports/support-repository';
import {
  ENQUIRIES_FIXTURE,
  STALL_HOURS_THREAD,
} from '../../core/api/in-memory/in-memory-support-repository';
import { EnquiryMessage, EnquirySummary, EnquiryThread } from '../../core/models/support.model';
import { UNASSIGNED, SupportStore } from './support-store';

class StubSupportRepository extends SupportRepository {
  override inbox(): Observable<readonly EnquirySummary[]> {
    return of(ENQUIRIES_FIXTURE);
  }
  override thread(): Observable<EnquiryThread> {
    return of(STALL_HOURS_THREAD);
  }
  override reply(): Observable<EnquiryMessage> {
    return of(STALL_HOURS_THREAD.messages[0]!);
  }
  override resolve(): Observable<EnquirySummary> {
    return of({ ...ENQUIRIES_FIXTURE[0]!, status: 'resolved' });
  }
  override assign(): Observable<EnquirySummary> {
    return of(ENQUIRIES_FIXTURE[0]!);
  }
}

class FailingSupportRepository extends StubSupportRepository {
  override inbox(): Observable<readonly EnquirySummary[]> {
    return throwError(() => new Error('The inbox is unavailable.'));
  }
}

function storeWith(repo: typeof StubSupportRepository): SupportStore {
  TestBed.configureTestingModule({
    providers: [SupportStore, { provide: SupportRepository, useClass: repo }],
  });
  return TestBed.inject(SupportStore);
}

describe('SupportStore', () => {
  it('counts the open queue, not the filtered view', () => {
    const store = storeWith(StubSupportRepository);
    store.load();

    expect(store.items().length).toBe(11);
    expect(store.openCount()).toBe(9);

    store.setFilters({ source: 'email' });
    expect(store.visible().length).toBeLessThan(9);
    // The header count still describes the whole queue.
    expect(store.openCount()).toBe(9);
  });

  it('defaults to open enquiries, and can widen to all', () => {
    const store = storeWith(StubSupportRepository);
    store.load();

    expect(store.visible().every((enquiry) => enquiry.status === 'open')).toBe(true);
    expect(store.visible().length).toBe(9);

    store.setFilters({ status: 'all' });
    expect(store.visible().length).toBe(11);

    store.setFilters({ status: 'resolved' });
    expect(store.visible().every((enquiry) => enquiry.status === 'resolved')).toBe(true);
  });

  it('is one inbox with the source as a filter, not three lists', () => {
    const store = storeWith(StubSupportRepository);
    store.load();

    store.setFilters({ source: 'vendor-help' });
    expect(store.visible().every((enquiry) => enquiry.source === 'vendor-help')).toBe(true);

    store.setFilters({ source: null });
    const sources = new Set(store.visible().map((enquiry) => enquiry.source));
    expect(sources.size).toBe(3);
  });

  it('treats unassigned as a choice rather than the absence of one', () => {
    const store = storeWith(StubSupportRepository);
    store.load();

    store.setFilters({ assignee: UNASSIGNED });
    expect(store.visible().length).toBeGreaterThan(0);
    expect(store.visible().every((enquiry) => enquiry.assignee === null)).toBe(true);

    store.setFilters({ assignee: 'Dara Kelly' });
    expect(store.visible().every((enquiry) => enquiry.assignee === 'Dara Kelly')).toBe(true);
  });

  it('flags an open enquiry left past 48 hours', () => {
    const store = storeWith(StubSupportRepository);
    store.load();

    // Two open enquiries are older than 48h; the resolved ones do not count.
    expect(store.overdueCount()).toBeGreaterThan(0);
    expect(
      store.items().filter((enquiry) => enquiry.status === 'resolved' && enquiry.ageHours > 48)
        .length,
    ).toBeGreaterThan(0);
    expect(store.overdueCount()).toBe(
      store.items().filter((e) => e.status === 'open' && e.ageHours >= 48).length,
    );
  });

  it('lists newest first', () => {
    const store = storeWith(StubSupportRepository);
    store.load();

    const ages = store.visible().map((enquiry) => enquiry.ageHours);
    expect([...ages].sort((a, b) => a - b)).toEqual(ages);
  });

  it('searches who wrote in, the subject and the snippet', () => {
    const store = storeWith(StubSupportRepository);
    store.load();

    store.setFilters({ q: 'mcnally' });
    expect(store.visible().map((enquiry) => enquiry.id)).toEqual(['enq-stall-hours']);

    store.setFilters({ q: 'punnets' });
    expect(store.visible().map((enquiry) => enquiry.id)).toEqual(['enq-refund']);
  });

  it('swaps a row in place rather than re-fetching the queue', () => {
    const store = storeWith(StubSupportRepository);
    store.load();
    const before = store.items().length;

    store.patch({ ...ENQUIRIES_FIXTURE[0]!, status: 'resolved' });

    expect(store.items().length).toBe(before);
    expect(store.items().find((e) => e.id === 'enq-stall-hours')?.status).toBe('resolved');
    expect(store.openCount()).toBe(8);
  });

  it('surfaces a failed load as an error', () => {
    const store = storeWith(FailingSupportRepository);
    store.load();

    expect(store.hasError()).toBe(true);
    expect(store.error()).toBe('The inbox is unavailable.');
  });
});
