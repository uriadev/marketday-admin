import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MediaRepository } from '../../../core/api/ports/media-repository';
import {
  ListingStatus,
  PRODUCT_CATEGORY_LABELS,
  PRODUCT_UNIT_LABELS,
  ProductCategory,
  ProductDraft,
  ProductForm as ProductFormData,
  ProductMarket,
  ProductUnit,
  sentenceList,
} from '../../../core/models/product.model';
import { Notifications } from '../../../core/notifications/notifications';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { ImageUpload } from '../../../shared/components/image-upload/image-upload';
import { Crumb, PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusPill } from '../../../shared/components/status-pill/status-pill';
import {
  DeleteProductDialog,
  DeleteProductDialogData,
} from '../delete-product-dialog/delete-product-dialog';
import { ProductFormFacade } from '../product-form-facade';

/** Where a product stands at one market. `null` is the market being switched off. */
type Carried = ListingStatus | null;

/** What tapping a market row does, in the design's order. */
const CYCLE: readonly Carried[] = ['available', 'sold-out', null];

/**
 * Add a product, and change one later (design 4a). One screen for both:
 * `/vendors/:slug/products/new` and `/vendors/:slug/products/:productId` differ
 * only in what is filled in, what the footer says, and whether there is a change
 * log and a delete action underneath.
 *
 * "Where it is sold" is part of the form rather than a second step, because
 * carrying a product at a market and having it in stock are one decision for a
 * vendor — the row cycles available → sold out → not carried, and a market it is
 * not carried at simply has no listing.
 */
@Component({
  selector: 'md-product-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ProductFormFacade],
  imports: [
    RouterLink,
    ReactiveFormsModule,
    PageHeader,
    Avatar,
    StatusPill,
    ImageUpload,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTooltipModule,
  ],
  templateUrl: './product-form.html',
  styleUrl: './product-form.css',
})
export class ProductForm {
  /** Bound from the route params by `withComponentInputBinding()`. */
  readonly slug = input.required<string>();
  /** Absent on `/products/new` — the only thing that separates the two states. */
  readonly productId = input<string>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly media = inject(MediaRepository);
  private readonly notifications = inject(Notifications);

  protected readonly facade = inject(ProductFormFacade);

  protected readonly categories = Object.entries(PRODUCT_CATEGORY_LABELS) as [
    ProductCategory,
    string,
  ][];
  protected readonly units = Object.entries(PRODUCT_UNIT_LABELS) as [ProductUnit, string][];

  protected readonly form = this.fb.group({
    name: this.fb.control('', Validators.required),
    category: this.fb.control<ProductCategory | null>(null, Validators.required),
    unit: this.fb.control<ProductUnit | null>(null, Validators.required),
    price: this.fb.control<number | null>(null, [Validators.required, Validators.min(0)]),
    description: this.fb.control('', Validators.maxLength(400)),
    imageUrl: this.fb.control<string | null>(null),
  });

  /**
   * Where it is sold, by market slug. Outside the group because "not carried"
   * is the absence of a listing rather than a value a control could hold, and
   * because the rows are tapped rather than typed.
   */
  protected readonly carried = signal<Readonly<Record<string, Carried>>>({});

  protected readonly uploading = signal(false);

  /** Re-read on every keystroke, so the preview and the checklist track the form. */
  private readonly value = toSignal(
    this.form.valueChanges.pipe(map(() => this.form.getRawValue())),
    { initialValue: this.form.getRawValue() },
  );

  protected readonly isEdit = computed(() => this.productId() !== undefined);
  protected readonly backLink = computed(() => `/vendors/${this.slug()}/products`);

  /**
   * "Vendors / Cork Artisan Bakery / New product" — the vendor is the step this
   * screen hangs off, so it is named rather than called "Products". Its name
   * arrives with the load, and until then the trail is just the directory.
   */
  protected readonly crumbs = computed<Crumb[]>(() => {
    const trail: Crumb[] = [{ label: 'Vendors', link: '/vendors' }];
    const vendorName = this.facade.form()?.vendorName;
    if (vendorName) trail.push({ label: vendorName, link: this.backLink() });
    return trail;
  });

  protected readonly heading = computed(() =>
    this.isEdit() ? (this.facade.form()?.product?.name ?? 'Product') : 'New product',
  );
  protected readonly title = computed(() =>
    this.isEdit() ? (this.facade.form()?.product?.name ?? 'Product') : 'Add a product',
  );
  protected readonly subtitle = computed(() =>
    this.isEdit()
      ? 'Changes are live the moment they are saved.'
      : 'It appears on the shopper view as soon as a market is switched on.',
  );
  protected readonly saveState = computed(() => {
    const savedAt = this.facade.form()?.savedAt;
    return savedAt ? `Saved ${savedAt}` : 'Not saved yet';
  });
  protected readonly saveLabel = computed(() => (this.isEdit() ? 'Save changes' : 'Add product'));

  protected readonly tip = computed(() =>
    this.isEdit()
      ? 'Sold out resets to available at 06:00 on each market day.'
      : 'Products carry over between market days. You only change the status when something runs out.',
  );
  protected readonly previewNote = computed(() =>
    this.isEdit()
      ? 'Sold out hides the buy button but keeps the product visible.'
      : 'Shoppers see the product only at markets switched on above.',
  );

  /* ── Where it is sold ──────────────────────────────────────────────────── */

  /** One row per market the vendor trades at, with the status it holds today. */
  protected readonly marketRows = computed(() =>
    this.facade.markets().map((market) => ({
      market,
      status: this.carried()[market.slug] ?? null,
    })),
  );

  protected readonly carriedCount = computed(
    () => this.marketRows().filter((row) => row.status !== null).length,
  );

  /** "Carried at 2 of 3 markets" — the footer's line while adding. */
  protected readonly carriedSummary = computed(
    () => `Carried at ${this.carriedCount()} of ${this.facade.markets().length} markets`,
  );

  protected readonly footerNote = computed(() => {
    const editor = this.facade.form()?.lastEditedBy;
    return this.isEdit() && editor ? `Last edited by ${editor}` : this.carriedSummary();
  });

  /* ── Shopper view ──────────────────────────────────────────────────────── */

  protected readonly preview = computed(() => {
    const { name, unit, price, imageUrl } = this.value();
    const unitLabel = unit ? PRODUCT_UNIT_LABELS[unit] : 'Unit';
    return {
      name: name || 'Product name',
      unnamed: name === '',
      meta: `${unitLabel} · €${(price ?? 0).toFixed(2)}`,
      imageUrl,
    };
  });

  /** The same three rows the form shows, in the words a shopper would read. */
  protected readonly previewRows = computed(() =>
    this.marketRows().map(({ market, status }) => ({
      market,
      label: status === null ? 'Not listed' : status === 'sold-out' ? 'Sold out' : 'In stock',
      tone:
        status === null
          ? ('muted' as const)
          : status === 'sold-out'
            ? ('warn' as const)
            : ('positive' as const),
    })),
  );

  protected readonly checklist = computed(() => {
    const { name, unit, price, imageUrl, description } = this.value();
    const carried = this.carriedCount();
    return [
      { label: 'Name, unit and price', done: !!name && unit !== null && price !== null },
      {
        label: carried > 0 ? this.carriedSummary() : 'Pick at least one market',
        done: carried > 0,
      },
      { label: 'Photo', done: !!imageUrl },
      { label: 'Description', done: description.trim() !== '' },
    ];
  });

  constructor() {
    effect(() => this.facade.load(this.slug(), this.productId() ?? null));
    // The loaded record is the form's baseline, not an edit of it.
    effect(() => {
      const loaded = this.facade.form();
      if (loaded) this.seed(loaded);
    });
  }

  /* ── Editing ───────────────────────────────────────────────────────────── */

  protected cycle(market: ProductMarket): void {
    const current = this.carried()[market.slug] ?? null;
    const next = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length] ?? null;
    this.carried.update((rows) => ({ ...rows, [market.slug]: next }));
  }

  protected statusLabel(status: Carried): string {
    if (status === null) return 'Not carried';
    return status === 'sold-out' ? 'Sold out' : 'Available';
  }

  /** What activating the row will do, for the tooltip and the screen reader. */
  protected rowAction(market: ProductMarket, status: Carried): string {
    const next = CYCLE[(CYCLE.indexOf(status) + 1) % CYCLE.length] ?? null;
    return `${market.label}: ${this.statusLabel(status)}. Change to ${this.statusLabel(next).toLowerCase()}`;
  }

  protected onImagePicked(file: File): void {
    this.uploading.set(true);
    this.media.upload(file, 'product-image').subscribe({
      next: (uploaded) => {
        this.uploading.set(false);
        this.form.controls.imageUrl.setValue(uploaded.url);
        this.form.controls.imageUrl.markAsDirty();
      },
      error: () => {
        this.uploading.set(false);
        this.notifications.error("That photo didn't upload. Try again.");
      },
    });
  }

  protected onImageCleared(): void {
    this.form.controls.imageUrl.setValue(null);
    this.form.controls.imageUrl.markAsDirty();
  }

  protected onImageRejected(reason: string): void {
    this.notifications.error(reason);
  }

  /* ── Saving ────────────────────────────────────────────────────────────── */

  protected save(addAnother = false): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notifications.error('Fill in the name, category, unit and price before saving.');
      return;
    }

    this.facade.save(this.draft(), (saved) => {
      if (!saved) {
        this.notifications.error(this.facade.error() ?? "Those changes didn't save.");
        return;
      }
      if (this.isEdit()) {
        this.notifications.success(`${saved.name} is saved.`);
        return;
      }
      this.notifications.success(`${saved.name} is on ${this.facade.form()?.vendorName}’s list.`);
      if (addAnother) {
        // Keep where it is sold — the next product usually goes to the same
        // markets — and clear what makes this one itself.
        this.form.reset({
          name: '',
          category: this.form.controls.category.value,
          unit: null,
          price: null,
          description: '',
          imageUrl: null,
        });
      } else {
        void this.router.navigate(['/vendors', this.slug(), 'products']);
      }
    });
  }

  protected confirmDelete(): void {
    const product = this.facade.form()?.product;
    if (!product) return;

    const data: DeleteProductDialogData = {
      productName: product.name,
      where: sentenceList(
        this.marketRows()
          .filter((row) => row.status !== null)
          .map((row) => row.market.label),
      ),
    };

    this.dialog
      .open<DeleteProductDialog, DeleteProductDialogData, boolean>(DeleteProductDialog, { data })
      .afterClosed()
      .subscribe((confirmed) => {
        if (!confirmed) return;
        this.facade.remove((removed) => {
          if (!removed) {
            this.notifications.error(this.facade.error() ?? "That product wasn't deleted.");
            return;
          }
          this.notifications.success(`${product.name} is deleted.`);
          void this.router.navigate(['/vendors', this.slug(), 'products']);
        });
      });
  }

  /* ── Helpers ───────────────────────────────────────────────────────────── */

  private draft(): ProductDraft {
    const { name, category, unit, price, description, imageUrl } = this.form.getRawValue();
    const listings: Record<string, ListingStatus> = {};
    for (const { market, status } of this.marketRows()) {
      if (status !== null) listings[market.slug] = status;
    }
    return {
      name: name.trim(),
      category: category!,
      unit: unit!,
      price: price ?? 0,
      description: description.trim(),
      imageUrl,
      listings,
    };
  }

  private seed(loaded: ProductFormData): void {
    const product = loaded.product;
    this.form.reset({
      name: product?.name ?? '',
      category: product?.category ?? null,
      unit: product?.unit ?? null,
      price: product?.price ?? null,
      description: product?.description ?? '',
      imageUrl: product?.imageUrl ?? null,
    });
    this.carried.set(
      Object.fromEntries(
        loaded.markets.map((market) => [market.slug, product?.listings[market.slug] ?? null]),
      ),
    );
  }
}
