import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Observable, of, throwError } from 'rxjs';
import { MarketRepository } from '../../../core/api/ports/market-repository';
import { MARKETS_FIXTURE } from '../../../core/api/in-memory/market-fixture';
import { MarketSummary } from '../../../core/models/market.model';
import { AddMarketDialog, AddMarketDialogData } from './add-market-dialog';

/** The directory is small enough to hand over whole — that is the point. */
class StubMarketRepository {
  reads = 0;
  refuse = false;

  list(): Observable<readonly MarketSummary[]> {
    this.reads += 1;
    if (this.refuse) return throwError(() => new Error('Those markets could not be loaded.'));
    return of(MARKETS_FIXTURE);
  }
}

const closed: (MarketSummary | undefined)[] = [];
const ref = { close: (picked?: MarketSummary) => closed.push(picked) };

let repo: StubMarketRepository;

function open(joinedSlugs: readonly string[] = []) {
  TestBed.overrideProvider(MAT_DIALOG_DATA, {
    useValue: { vendorName: 'McNally Family Farm', joinedSlugs } as AddMarketDialogData,
  });
  const fixture = TestBed.createComponent(AddMarketDialog);
  fixture.detectChanges();
  return fixture;
}

function host(fixture: { nativeElement: unknown }): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function optionNames(fixture: { nativeElement: unknown }): string[] {
  return Array.from(host(fixture).querySelectorAll('mat-list-option')).map((option) =>
    (option.querySelector('[matListItemTitle]')?.textContent ?? '').trim(),
  );
}

function search(fixture: { nativeElement: unknown; detectChanges(): void }, text: string): void {
  const input = host(fixture).querySelector('input') as HTMLInputElement;
  input.value = text;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

function add(fixture: { nativeElement: unknown }): HTMLButtonElement {
  return Array.from(host(fixture).querySelectorAll('button')).find((button) =>
    button.textContent?.includes('Add to market'),
  ) as HTMLButtonElement;
}

describe('AddMarketDialog', () => {
  beforeEach(async () => {
    closed.length = 0;
    repo = new StubMarketRepository();
    await TestBed.configureTestingModule({
      imports: [AddMarketDialog],
      providers: [
        provideNoopAnimations(),
        { provide: MarketRepository, useValue: repo },
        { provide: MatDialogRef, useValue: ref },
        { provide: MAT_DIALOG_DATA, useValue: {} },
      ],
    }).compileComponents();
  });

  it('offers every market, read once rather than per keystroke', () => {
    const fixture = open();

    expect(optionNames(fixture).length).toBe(MARKETS_FIXTURE.length);

    search(fixture, 'temple');
    search(fixture, 'kinsale');

    expect(repo.reads).toBe(1);
  });

  it('leaves out the markets the vendor already trades at', () => {
    const fixture = open(['temple-bar', 'marlay-park']);
    const names = optionNames(fixture);

    expect(names).not.toContain('Temple Bar Food Market');
    expect(names.length).toBe(MARKETS_FIXTURE.length - 2);
  });

  it('narrows on the name and on the county', () => {
    const fixture = open();

    search(fixture, 'kinsale');
    expect(optionNames(fixture)).toEqual(['Kinsale Harbour Market']);

    search(fixture, 'Cork');
    expect(optionNames(fixture).length).toBeGreaterThan(1);
  });

  it('says why the list is empty, in the words that fit the reason', () => {
    const everywhere = open(MARKETS_FIXTURE.map((market) => market.slug));
    expect(host(everywhere).textContent).toContain('already trades at every market');

    search(everywhere, 'nowhere');
    expect(host(everywhere).textContent).toContain('No other market matches “nowhere”');
  });

  it('answers with the market that was picked, and only once one is', () => {
    const fixture = open();
    expect(add(fixture).disabled).toBe(true);

    search(fixture, 'kinsale');
    (host(fixture).querySelectorAll('mat-list-option')[0] as HTMLElement).click();
    fixture.detectChanges();
    add(fixture).click();

    expect(closed.map((market) => market?.slug)).toEqual(['kinsale-harbour']);
  });

  it('shows a refusal instead of an empty list, and stays closed', () => {
    repo.refuse = true;

    const fixture = open();

    expect(host(fixture).textContent).toContain('Those markets could not be loaded.');
    expect(closed).toEqual([]);
  });
});
