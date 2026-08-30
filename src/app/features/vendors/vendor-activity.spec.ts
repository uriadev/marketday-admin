import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Observable, of, throwError } from 'rxjs';
import { ActivityRepository } from '../../core/api/ports/activity-repository';
import { buildFeed } from '../../core/api/in-memory/in-memory-activity-repository';
import { ActivityFeed, ActivityFilters } from '../../core/models/activity.model';
import { VendorActivity } from './vendor-activity';
import { VendorActivityStore } from './vendor-activity-store';

/**
 * The shipped fixture, answered synchronously — the specs assert on McNally's
 * real log, and nothing here waits on a timer (there is no zone.js to fake).
 * Paging and filtering are the fixture's own, so this only strips the latency.
 */
class StubActivityRepository extends ActivityRepository {
  override feed(
    vendorSlug: string,
    filters: ActivityFilters,
    before?: number,
  ): Observable<ActivityFeed> {
    const feed = buildFeed(vendorSlug, filters, before);
    if (!feed) return throwError(() => new Error(`No vendor matches \u201c${vendorSlug}\u201d.`));
    return of(feed);
  }
}

function open(slug = 'mcnally-family-farm') {
  const fixture = TestBed.createComponent(VendorActivity);
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

function entries(fixture: { nativeElement: unknown }): HTMLElement[] {
  return Array.from(host(fixture).querySelectorAll('.entry'));
}

function days(fixture: { nativeElement: unknown }): string[] {
  return Array.from(host(fixture).querySelectorAll('.day-title')).map(
    (element) => element.textContent?.trim() ?? '',
  );
}

function button(fixture: { nativeElement: unknown }, label: string): HTMLButtonElement {
  const match = Array.from(host(fixture).querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.trim().startsWith(label),
  );
  expect(match).toBeDefined();
  return match as HTMLButtonElement;
}

describe('VendorActivity', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VendorActivity],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        VendorActivityStore,
        { provide: ActivityRepository, useClass: StubActivityRepository },
      ],
    }).compileComponents();
  });

  it('files each change under the day it happened', () => {
    const fixture = open();

    expect(days(fixture).slice(0, 3)).toEqual([
      'Today · Thursday 20 August',
      'Yesterday · Wednesday 19 August',
      'Monday 17 August',
    ]);
  });

  it('says who did what, with the detail under it', () => {
    const fixture = open();
    const first = entries(fixture)[0]!;

    expect(first.textContent).toContain('MarketDay');
    expect(first.textContent).toContain('could not take the Marlay Park fee');
    expect(first.textContent).toContain('Card ···· 4417 declined');
    expect(first.textContent).toContain('Payment');
    expect(first.textContent).toContain('Marlay Park');
    expect(first.textContent).toContain('automatic');
    expect(first.textContent).toContain('07:02');
  });

  it('links a market chip through to the market', () => {
    const fixture = open();

    expect(entries(fixture)[0]?.querySelector('a[href="/markets/marlay-park"]')).not.toBeNull();
  });

  it('narrows to one kind of change, from the top', () => {
    const fixture = open();

    // The URL drives the feed, so a filter is set the way a chip sets it.
    fixture.componentRef.setInput('kind', 'payment');
    fixture.detectChanges();

    expect(entries(fixture).length).toBeGreaterThan(0);
    expect(entries(fixture).every((entry) => entry.textContent?.includes('Payment'))).toBe(true);
    expect(text(fixture)).not.toContain('invited Sam Okafor as a stallholder');
  });

  it('narrows to one person', () => {
    const fixture = open();

    fixture.componentRef.setInput('actor', 'Bríd McNally');
    fixture.detectChanges();

    expect(entries(fixture).length).toBeGreaterThan(0);
    expect(entries(fixture).every((entry) => entry.textContent?.includes('Bríd McNally'))).toBe(
      true,
    );
  });

  it('explains an empty result rather than showing a blank feed', () => {
    const fixture = open();

    // The platform never uploads a document; only the vendor does.
    fixture.componentRef.setInput('kind', 'document');
    fixture.componentRef.setInput('actor', 'MarketDay');
    fixture.detectChanges();

    expect(text(fixture)).toContain('Nothing matches those filters');
    expect(text(fixture)).toContain('Clear filters');
  });

  it('loads older activity, extending the last day rather than repeating it', () => {
    const fixture = open();
    const store = TestBed.inject(VendorActivityStore);

    const firstPage = entries(fixture).length;
    const lastDay = days(fixture).at(-1);
    expect(store.hasMore()).toBe(true);

    button(fixture, 'Load older activity').click();
    fixture.detectChanges();

    expect(entries(fixture).length).toBeGreaterThan(firstPage);
    // A day that spanned the page boundary keeps one heading, not two.
    expect(days(fixture).filter((day) => day === lastDay).length).toBe(1);
    expect(new Set(days(fixture)).size).toBe(days(fixture).length);
  });

  it('reaches the end of the log and says so', () => {
    const fixture = open();
    const store = TestBed.inject(VendorActivityStore);

    for (let i = 0; i < 10 && store.hasMore(); i++) {
      store.loadOlder();
      fixture.detectChanges();
    }

    expect(store.hasMore()).toBe(false);
    expect(text(fixture)).toContain('That is the whole log.');
  });

  it('counts the window over the whole log, not the page on screen', () => {
    const fixture = open();
    const store = TestBed.inject(VendorActivityStore);
    const rail = host(fixture).querySelector('aside') as HTMLElement;

    const changes = store.summary().changes;
    expect(changes).toBeGreaterThan(entries(fixture).length);
    expect(rail.textContent).toContain(`${changes}`);
    expect(rail.textContent).toContain('By admins');

    // Loading more of the feed does not move a figure about the log.
    store.loadOlder();
    fixture.detectChanges();
    expect(store.summary().changes).toBe(changes);
  });

  it('ranks the people who changed the most, and lets one be picked', () => {
    const fixture = open();
    const store = TestBed.inject(VendorActivityStore);
    const rail = host(fixture).querySelector('aside') as HTMLElement;

    const top = store.summary().mostActive[0]!;
    // The platform acting on its own is not a person and does not compete.
    expect(store.summary().mostActive.some((person) => person.name === 'MarketDay')).toBe(false);
    expect(rail.textContent).toContain(top.name);
    expect(rail.textContent).toContain(top.role);

    // Ranked, so the busiest person is the one at the top.
    const counts = store.summary().mostActive.map((person) => person.count);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
    expect(top.count).toBeGreaterThan(0);
    // Each row is a real control that narrows the feed to that person.
    expect(rail.querySelectorAll('button.person').length).toBe(counts.length);
  });

  it('says what the log does and does not keep', () => {
    const fixture = open();

    expect(text(fixture)).toContain('What lands here');
    expect(text(fixture)).toContain('Sign-ins and page views do not.');
    expect(text(fixture)).toContain(
      'Kept for 24 months, then only the membership and payment entries are retained.',
    );
  });
});

/** A vendor slug nothing matches — the tab has to say so, not sit blank. */
class MissingVendorRepository extends ActivityRepository {
  override feed(): Observable<ActivityFeed> {
    return throwError(() => new Error('No vendor matches “nobody”.'));
  }
}

describe('VendorActivity for a vendor that is not there', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VendorActivity],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        VendorActivityStore,
        { provide: ActivityRepository, useClass: MissingVendorRepository },
      ],
    }).compileComponents();
  });

  it('reports the error and offers a retry', () => {
    const fixture = open('nobody');

    expect(text(fixture)).toContain('No vendor matches “nobody”.');
    expect(text(fixture)).toContain('Retry');
    expect(host(fixture).querySelector('.entry')).toBeNull();
  });
});
