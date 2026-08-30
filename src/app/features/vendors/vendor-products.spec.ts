import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Observable, of, throwError } from 'rxjs';
import { ProductRepository } from '../../core/api/ports/product-repository';
import { buildProductBoard } from '../../core/api/in-memory/in-memory-product-repository';
import { ListingStatus, VendorProduct, VendorProductBoard } from '../../core/models/product.model';
import { VendorProducts } from './vendor-products';
import { VendorProductsStore } from './vendor-products-store';

/**
 * The shipped fixture, answered synchronously — the specs assert on McNally's
 * real list, and nothing here waits on a timer (there is no zone.js to fake).
 */
class StubProductRepository extends ProductRepository {
  private board_ = buildProductBoard('mcnally-family-farm')!;

  override board(vendorSlug: string): Observable<VendorProductBoard> {
    if (vendorSlug !== 'mcnally-family-farm') {
      return throwError(() => new Error(`No vendor matches “${vendorSlug}”.`));
    }
    return of(this.board_);
  }

  override setStatus(
    _vendorSlug: string,
    productId: string,
    marketSlug: string,
    status: ListingStatus,
  ): Observable<VendorProduct> {
    const products = this.write((product) =>
      product.id === productId && marketSlug in product.listings
        ? { ...product, listings: { ...product.listings, [marketSlug]: status } }
        : product,
    );
    return of(products.find((product) => product.id === productId)!);
  }

  override markMarketSoldOut(
    _vendorSlug: string,
    marketSlug: string,
  ): Observable<readonly VendorProduct[]> {
    return of(
      this.write((product) =>
        marketSlug in product.listings
          ? { ...product, listings: { ...product.listings, [marketSlug]: 'sold-out' as const } }
          : product,
      ),
    );
  }

  override resetSoldOut(): Observable<readonly VendorProduct[]> {
    return of(
      this.write((product) => ({
        ...product,
        listings: Object.fromEntries(
          Object.keys(product.listings).map((slug) => [slug, 'available' as const]),
        ),
      })),
    );
  }

  override setHidden(
    _vendorSlug: string,
    productId: string,
    hidden: boolean,
  ): Observable<VendorProduct> {
    const products = this.write((product) =>
      product.id === productId ? { ...product, hidden } : product,
    );
    return of(products.find((product) => product.id === productId)!);
  }

  private write(map: (product: VendorProduct) => VendorProduct): readonly VendorProduct[] {
    const products = this.board_.products.map(map);
    this.board_ = { ...this.board_, products };
    return products;
  }
}

function open(slug = 'mcnally-family-farm') {
  const fixture = TestBed.createComponent(VendorProducts);
  fixture.componentRef.setInput('slug', slug);
  fixture.detectChanges();
  return fixture;
}

function text(fixture: { nativeElement: unknown }): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

function rows(fixture: { nativeElement: unknown }): HTMLElement[] {
  return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr'));
}

function rowFor(fixture: { nativeElement: unknown }, name: string, meta?: string): HTMLElement {
  const match = rows(fixture).find(
    (row) => row.textContent?.includes(name) && (!meta || row.textContent.includes(meta)),
  );
  expect(match).toBeDefined();
  return match!;
}

describe('VendorProducts', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VendorProducts],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        VendorProductsStore,
        { provide: ProductRepository, useClass: StubProductRepository },
      ],
    }).compileComponents();
  });

  it('counts the list and how much of it is sold out today', () => {
    const fixture = open();
    expect(text(fixture)).toContain('14 products · 3 sold out today');
  });

  it('gives every market the vendor trades at a column, with its stall', () => {
    const fixture = open();
    const headers = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('thead th'),
    ).map((th) => th.textContent ?? '');

    expect(headers[0]).toContain('Product');
    expect(headers[1]).toContain('Temple Bar');
    expect(headers[1]).toContain('Stall A7');
    expect(headers[2]).toContain('Marlay Park');
    expect(headers[2]).toContain('Stall 12');
    // A paused membership keeps its column — its listings come back with it.
    expect(headers[3]).toContain('Howth');
    expect(headers[3]).toContain('Paused');
  });

  it('shows a status per market, and “Not carried” where there is no listing', () => {
    const fixture = open();

    const rhubarb = rowFor(fixture, 'Rhubarb', '500g');
    const cells = Array.from(rhubarb.querySelectorAll('td'));
    expect(cells[1]?.textContent).toContain('Sold out');
    expect(cells[2]?.textContent).toContain('Available');
    expect(cells[3]?.textContent).toContain('Not carried');
    // "Not carried" is a gap in the list, never a clickable status.
    expect(cells[3]?.querySelector('button.cell')).toBeNull();
  });

  it('flips one cell without touching the same product at another market', () => {
    const fixture = open();

    const chard = rowFor(fixture, 'Rainbow chard');
    const cell = chard.querySelectorAll('td')[1]?.querySelector('button.cell') as HTMLButtonElement;
    expect(cell.textContent).toContain('Available');

    cell.click();
    fixture.detectChanges();

    const after = Array.from(rowFor(fixture, 'Rainbow chard').querySelectorAll('td'));
    expect(after[1]?.textContent).toContain('Sold out');
    expect(after[2]?.textContent).toContain('Available');
    // The header count is derived, so it moves with the grid.
    expect(text(fixture)).toContain('14 products · 4 sold out today');
  });

  it('lists what is sold out right now, and puts it back', () => {
    const fixture = open();
    const rail = (fixture.nativeElement as HTMLElement).querySelector('aside') as HTMLElement;

    expect(rail.textContent).toContain('Rhubarb');
    expect(rail.textContent).toContain('Temple Bar');
    // One entry per product, whatever number of markets it is out at.
    expect(rail.textContent).toContain('Temple Bar and Marlay Park');

    const restock = Array.from(rail.querySelectorAll('button')).find((button) =>
      button.getAttribute('aria-label')?.startsWith('Restock Rhubarb'),
    ) as HTMLButtonElement;
    restock.click();
    fixture.detectChanges();

    expect(text(fixture)).toContain('14 products · 2 sold out today');
    expect(rowFor(fixture, 'Rhubarb', '500g').querySelectorAll('td')[1]?.textContent).toContain(
      'Available',
    );
  });

  it('tallies each market, and says why a paused one has nothing to mark', () => {
    const fixture = open();
    const rail = (fixture.nativeElement as HTMLElement).querySelector('aside') as HTMLElement;

    // 12 of McNally's 14 products are carried at Temple Bar; two are sold out.
    expect(rail.textContent).toContain('10 of 12 carried products available');
    expect(rail.textContent).toContain('Paused — nothing on the shopper view');
  });

  it('takes one market’s whole list off the shopper view', () => {
    const fixture = open();
    const rail = (fixture.nativeElement as HTMLElement).querySelector('aside') as HTMLElement;

    const soldOut = Array.from(rail.querySelectorAll('button')).find(
      (button) => button.getAttribute('aria-label') === 'Mark everything sold out at Marlay Park',
    ) as HTMLButtonElement;
    soldOut.click();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('aside')?.textContent).toContain(
      '0 of 10 carried products available',
    );
    // Temple Bar is untouched — the command is scoped to one market.
    expect(rowFor(fixture, 'Rainbow chard').querySelectorAll('td')[1]?.textContent).toContain(
      'Available',
    );
  });

  it('clears every sold-out flag, as midnight does', () => {
    const fixture = open();

    const reset = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ).find((button) => button.textContent?.includes('Reset sold-out flags')) as HTMLButtonElement;
    reset.click();
    fixture.detectChanges();

    expect(text(fixture)).toContain('14 products');
    expect(text(fixture)).not.toContain('sold out today');
    // Nothing left to clear, so the button stops offering.
    expect(reset.disabled).toBe(true);
  });

  it('marks a hidden product and lets an admin put it back on the shopper view', () => {
    const fixture = open();

    const potatoes = rowFor(fixture, 'New potatoes');
    expect(potatoes.textContent).toContain('Hidden');

    TestBed.inject(VendorProductsStore).setFilters({ view: 'hidden' });
    fixture.detectChanges();
    expect(rows(fixture).length).toBe(1);
    expect(text(fixture)).toContain('New potatoes');
  });

  it('narrows to what is sold out somewhere, and to what is not carried everywhere', () => {
    const fixture = open();
    const store = TestBed.inject(VendorProductsStore);

    store.setFilters({ view: 'soldOut' });
    fixture.detectChanges();
    expect(rows(fixture).length).toBe(3);

    store.setFilters({ view: 'partial' });
    fixture.detectChanges();
    // Every product missing a listing at one of the three markets — including
    // the hidden one, which is carried nowhere at all.
    expect(rows(fixture).length).toBe(8);
  });

  it('narrows by category and by search', () => {
    const fixture = open();
    const store = TestBed.inject(VendorProductsStore);

    store.setFilters({ q: 'rhubarb' });
    fixture.detectChanges();
    // The fruit and the jam made from it.
    expect(rows(fixture).length).toBe(2);

    store.setFilters({ q: '', view: 'all' });
    store.setFilters({ q: 'jar' });
    fixture.detectChanges();
    expect(rows(fixture).length).toBe(3);
  });

  it('pages the grid rather than showing all fourteen at once', () => {
    const fixture = open();
    expect(rows(fixture).length).toBe(10);
    expect(text(fixture)).toContain('1 – 10 of 14');
  });

  it('shows the last change, wherever it came from', () => {
    const fixture = open();
    expect(text(fixture)).toContain('Bríd McNally marked Rhubarb sold out at Temple Bar');
    expect(text(fixture)).toContain('Today 11:20, from the vendor app');

    const chard = rowFor(fixture, 'Rainbow chard');
    (chard.querySelectorAll('td')[1]?.querySelector('button.cell') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(text(fixture)).toContain('You marked Rainbow chard sold out at Temple Bar');
  });
});

/** A vendor slug nothing matches — the tab has to say so, not sit blank. */
class MissingVendorRepository extends ProductRepository {
  override board(): Observable<VendorProductBoard> {
    return throwError(() => new Error('No vendor matches “nobody”.'));
  }
  override setStatus(): Observable<VendorProduct> {
    return throwError(() => new Error('gone'));
  }
  override markMarketSoldOut(): Observable<readonly VendorProduct[]> {
    return throwError(() => new Error('gone'));
  }
  override resetSoldOut(): Observable<readonly VendorProduct[]> {
    return throwError(() => new Error('gone'));
  }
  override setHidden(): Observable<VendorProduct> {
    return throwError(() => new Error('gone'));
  }
}

describe('VendorProducts for a vendor that is not there', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VendorProducts],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        VendorProductsStore,
        { provide: ProductRepository, useClass: MissingVendorRepository },
      ],
    }).compileComponents();
  });

  it('reports the error and offers a retry', () => {
    const fixture = open('nobody');
    expect(text(fixture)).toContain('No vendor matches “nobody”.');
    expect(text(fixture)).toContain('Retry');
  });
});
