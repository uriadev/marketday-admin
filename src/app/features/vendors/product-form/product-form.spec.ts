import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MatDialog } from '@angular/material/dialog';
import { Observable, of, throwError } from 'rxjs';
import { MediaRepository, UploadedImage } from '../../../core/api/ports/media-repository';
import { ProductRepository } from '../../../core/api/ports/product-repository';
import { buildProductBoard } from '../../../core/api/in-memory/in-memory-product-repository';
import {
  ListingStatus,
  ProductDraft,
  ProductForm as ProductFormData,
  VendorProduct,
  VendorProductBoard,
} from '../../../core/models/product.model';
import { ProductForm } from './product-form';

const VENDOR = 'mcnally-family-farm';
const RHUBARB = 'prd-1-rhubarb-500g';

/**
 * The shipped fixture, answered synchronously — the specs assert on McNally's
 * real rhubarb and its real markets, and nothing here waits on a timer.
 */
class StubProductRepository extends ProductRepository {
  board_ = buildProductBoard(VENDOR)!;
  /** What the last write was handed, so a spec can read the draft it composed. */
  lastDraft: ProductDraft | null = null;
  removed: string | null = null;
  refuse = false;

  override form(vendorSlug: string, productId: string | null): Observable<ProductFormData> {
    if (vendorSlug !== VENDOR) {
      return throwError(() => new Error(`No vendor matches “${vendorSlug}”.`));
    }
    const product = productId ? this.board_.products.find((row) => row.id === productId) : null;
    if (productId && !product) {
      return throwError(() => new Error('McNally Family Farm does not sell that.'));
    }
    return of({
      vendorSlug,
      vendorName: 'McNally Family Farm',
      markets: this.board_.markets,
      product: product ?? null,
      changes: product
        ? [{ what: 'Marked sold out at Temple Bar by Tom McNally', when: 'Today 11:20' }]
        : [],
      savedAt: product ? '4 minutes ago' : null,
      lastEditedBy: product ? 'Tom McNally · today 11:20' : null,
    });
  }

  override create(_vendorSlug: string, draft: ProductDraft): Observable<VendorProduct> {
    this.lastDraft = draft;
    if (this.refuse) return throwError(() => new Error('That product was refused.'));
    return of({
      id: 'prd-new-1',
      name: draft.name,
      meta: 'Bunch · vegetables',
      unit: draft.unit,
      category: draft.category,
      price: draft.price,
      description: draft.description,
      imageUrl: draft.imageUrl,
      hidden: false,
      listings: draft.listings,
    });
  }

  override update(
    _vendorSlug: string,
    productId: string,
    draft: ProductDraft,
  ): Observable<VendorProduct> {
    this.lastDraft = draft;
    const before = this.board_.products.find((row) => row.id === productId)!;
    return of({ ...before, ...draft });
  }

  override remove(_vendorSlug: string, productId: string): Observable<void> {
    this.removed = productId;
    return of(undefined);
  }

  /* Not reachable from this screen. */
  override board(): Observable<VendorProductBoard> {
    return of(this.board_);
  }
  override setStatus(): Observable<VendorProduct> {
    return throwError(() => new Error('not used here'));
  }
  override markMarketSoldOut(): Observable<readonly VendorProduct[]> {
    return throwError(() => new Error('not used here'));
  }
  override resetSoldOut(): Observable<readonly VendorProduct[]> {
    return throwError(() => new Error('not used here'));
  }
  override setHidden(): Observable<VendorProduct> {
    return throwError(() => new Error('not used here'));
  }
}

class StubMediaRepository extends MediaRepository {
  override upload(file: File): Observable<UploadedImage> {
    return of({ url: `https://cdn.test/${file.name}`, fileName: file.name, sizeBytes: file.size });
  }
}

let repo: StubProductRepository;

function open(productId?: string, slug = VENDOR) {
  const fixture = TestBed.createComponent(ProductForm);
  fixture.componentRef.setInput('slug', slug);
  if (productId) fixture.componentRef.setInput('productId', productId);
  fixture.detectChanges();
  return fixture;
}

function host(fixture: { nativeElement: unknown }): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function text(fixture: { nativeElement: unknown }): string {
  return host(fixture).textContent ?? '';
}

/** The "Where it is sold" rows, in market order. */
function marketRows(fixture: { nativeElement: unknown }): HTMLButtonElement[] {
  return Array.from(host(fixture).querySelectorAll('button.market'));
}

function buttonNamed(fixture: { nativeElement: unknown }, label: string): HTMLElement {
  const match = Array.from(host(fixture).querySelectorAll('button, a')).find(
    (element) => element.textContent?.trim() === label,
  );
  expect(match).toBeDefined();
  return match as HTMLElement;
}

beforeEach(async () => {
  repo = new StubProductRepository();
  await TestBed.configureTestingModule({
    imports: [ProductForm],
    providers: [
      // Saving navigates back to the products tab; a catch-all keeps that from
      // failing in a spec that only cares that the write happened.
      provideRouter([{ path: '**', children: [] }]),
      provideNoopAnimations(),
      { provide: ProductRepository, useValue: repo },
      { provide: MediaRepository, useClass: StubMediaRepository },
    ],
  }).compileComponents();
});

describe('ProductForm · adding a product', () => {
  it('opens empty, on the vendor’s markets, with nothing carried yet', () => {
    const fixture = open();

    expect(text(fixture)).toContain('Add a product');
    expect(text(fixture)).toContain('It appears on the shopper view as soon as a market is');
    expect(text(fixture)).toContain('Not saved yet');
    expect(text(fixture)).toContain('Carried at 0 of 3 markets');

    const rows = marketRows(fixture);
    expect(rows).toHaveLength(3);
    expect(rows[0]!.textContent).toContain('Temple Bar');
    for (const row of rows) expect(row.textContent).toContain('Not carried');
  });

  it('names the vendor in the trail above the heading', () => {
    const fixture = open();

    const trail = host(fixture).querySelector('nav[aria-label="Breadcrumb"]')!;
    const crumbs = Array.from(trail.querySelectorAll('a'));
    expect(crumbs.map((crumb) => crumb.textContent?.trim())).toEqual([
      'Vendors',
      'McNally Family Farm',
    ]);
    expect(crumbs[0]!.getAttribute('href')).toBe('/vendors');
    // The vendor goes back to the list this screen was opened from.
    expect(crumbs[1]!.getAttribute('href')).toBe(`/vendors/${VENDOR}/products`);
    expect(host(fixture).querySelector('h1')?.textContent?.trim()).toBe('New product');
  });

  it('offers "Save and add another", which editing does not', () => {
    expect(text(open())).toContain('Save and add another');
    expect(text(open(RHUBARB))).not.toContain('Save and add another');
  });

  it('cycles a market through available, sold out and not carried', () => {
    const fixture = open();
    const templeBar = () => marketRows(fixture)[0]!;

    templeBar().click();
    fixture.detectChanges();
    expect(templeBar().textContent).toContain('Available');
    expect(text(fixture)).toContain('Carried at 1 of 3 markets');

    templeBar().click();
    fixture.detectChanges();
    expect(templeBar().textContent).toContain('Sold out');

    templeBar().click();
    fixture.detectChanges();
    expect(templeBar().textContent).toContain('Not carried');
    expect(text(fixture)).toContain('Carried at 0 of 3 markets');
  });

  it('refuses to save without a name, category, unit and price', () => {
    const fixture = open();
    buttonNamed(fixture, 'Add product').click();
    fixture.detectChanges();

    expect(repo.lastDraft).toBeNull();
  });

  it('sends the fields and the markets switched on as one draft', () => {
    const fixture = open();
    const component = fixture.componentInstance as unknown as {
      form: { patchValue: (value: Record<string, unknown>) => void };
    };
    component.form.patchValue({
      name: 'Wild garlic',
      category: 'VEGETABLE',
      unit: 'BUNCH',
      price: 3.5,
      description: 'Picked that morning.',
    });
    fixture.detectChanges();

    marketRows(fixture)[0]!.click();
    marketRows(fixture)[1]!.click();
    marketRows(fixture)[1]!.click();
    fixture.detectChanges();

    buttonNamed(fixture, 'Add product').click();
    fixture.detectChanges();

    expect(repo.lastDraft).toEqual({
      name: 'Wild garlic',
      category: 'VEGETABLE',
      unit: 'BUNCH',
      price: 3.5,
      description: 'Picked that morning.',
      imageUrl: null,
      // Only the two markets switched on: the third has no listing at all.
      listings: { 'temple-bar': 'available', 'marlay-park': 'sold-out' },
    });
  });

  it('prices the shopper preview from the form, and lists every market', () => {
    const fixture = open();
    const component = fixture.componentInstance as unknown as {
      form: { patchValue: (value: Record<string, unknown>) => void };
    };
    component.form.patchValue({ name: 'Wild garlic', unit: 'BUNCH', price: 3.5 });
    fixture.detectChanges();

    expect(text(fixture)).toContain('Bunch · €3.50');
    expect(text(fixture)).toContain('Not listed');
  });

  it('goes back to the products tab once the product is added', () => {
    const fixture = open();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const component = fixture.componentInstance as unknown as {
      form: { patchValue: (value: Record<string, unknown>) => void };
    };
    component.form.patchValue({
      name: 'Wild garlic',
      category: 'VEGETABLE',
      unit: 'BUNCH',
      price: 3.5,
    });
    fixture.detectChanges();

    buttonNamed(fixture, 'Add product').click();
    fixture.detectChanges();

    expect(navigate).toHaveBeenCalledWith(['/vendors', VENDOR, 'products']);
  });

  it('stays on the form and empties the name for "Save and add another"', () => {
    const fixture = open();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const component = fixture.componentInstance as unknown as {
      form: {
        patchValue: (value: Record<string, unknown>) => void;
        getRawValue: () => { name: string; category: string | null };
      };
    };
    component.form.patchValue({
      name: 'Wild garlic',
      category: 'VEGETABLE',
      unit: 'BUNCH',
      price: 3.5,
    });
    fixture.detectChanges();

    buttonNamed(fixture, 'Save and add another').click();
    fixture.detectChanges();

    expect(navigate).not.toHaveBeenCalled();
    expect(component.form.getRawValue().name).toBe('');
    // The next product usually goes on the same shelf.
    expect(component.form.getRawValue().category).toBe('VEGETABLE');
  });
});

describe('ProductForm · changing one later', () => {
  it('fills the form from the stored product', () => {
    const fixture = open(RHUBARB);
    const component = fixture.componentInstance as unknown as {
      form: { getRawValue: () => Record<string, unknown> };
    };

    expect(component.form.getRawValue()).toMatchObject({
      name: 'Rhubarb',
      category: 'VEGETABLE',
      unit: 'G',
      price: 4,
    });
    expect(text(fixture)).toContain('Changes are live the moment they are saved.');
    expect(text(fixture)).toContain('Saved 4 minutes ago');
    expect(text(fixture)).toContain('Last edited by Tom McNally · today 11:20');
  });

  it('shows where it is sold as the board has it', () => {
    const fixture = open(RHUBARB);
    const rows = marketRows(fixture);

    expect(rows[0]!.textContent).toContain('Sold out');
    expect(rows[1]!.textContent).toContain('Available');
    // Rhubarb is not carried at Howth, so there is no listing to flip.
    expect(rows[2]!.textContent).toContain('Not carried');
  });

  it('shows the change log and the delete card, which adding does not', () => {
    expect(text(open(RHUBARB))).toContain('Marked sold out at Temple Bar by Tom McNally');
    expect(text(open(RHUBARB))).toContain('Delete this product');
    expect(text(open())).not.toContain('Recent changes');
    expect(text(open())).not.toContain('Delete this product');
  });

  it('saves an edited price against the product it loaded', () => {
    const fixture = open(RHUBARB);
    const component = fixture.componentInstance as unknown as {
      form: { patchValue: (value: Record<string, unknown>) => void };
    };
    component.form.patchValue({ price: 4.5 });
    fixture.detectChanges();

    buttonNamed(fixture, 'Save changes').click();
    fixture.detectChanges();

    expect(repo.lastDraft?.price).toBe(4.5);
    expect(repo.lastDraft?.name).toBe('Rhubarb');
  });

  it('deletes only once the confirmation is accepted', () => {
    const fixture = open(RHUBARB);
    const dialog = TestBed.inject(MatDialog);
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const open_ = vi
      .spyOn(dialog, 'open')
      .mockReturnValue({ afterClosed: () => of(false) } as never);
    buttonNamed(fixture, 'Delete').click();
    fixture.detectChanges();
    expect(repo.removed).toBeNull();

    open_.mockReturnValue({ afterClosed: () => of(true) } as never);
    buttonNamed(fixture, 'Delete').click();
    fixture.detectChanges();
    expect(repo.removed).toBe(RHUBARB);
    // The dialog names the markets the product actually comes off.
    expect(open_.mock.calls[1]![1]).toMatchObject({
      data: { productName: 'Rhubarb', where: 'Temple Bar and Marlay Park' },
    });
  });

  it('reports a product address the vendor has no product for', () => {
    const fixture = open('prd-nothing');
    expect(text(fixture)).toContain('McNally Family Farm does not sell that.');
    expect(text(fixture)).toContain('Back to products');
  });
});
