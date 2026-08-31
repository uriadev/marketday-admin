import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ProductRepository } from '../../core/api/ports/product-repository';
import { ProductDraft, ProductForm, VendorProduct } from '../../core/models/product.model';
import { LoadStatus } from '../../core/state/collection-store';

/**
 * The one product behind design 4a, for both of the form's addresses. Provided
 * at the route, so it dies with the screen.
 *
 * `/products/new` and `/products/:id` are the same load: the markets a product
 * can be sold at are the vendor's, whether or not the product exists yet, and
 * `productId === null` is the only difference between the two calls.
 */
@Injectable()
export class ProductFormFacade {
  private readonly repo = inject(ProductRepository);
  private readonly destroyRef = inject(DestroyRef);

  private vendorSlug = '';
  private productId: string | null = null;

  private readonly _form = signal<ProductForm | null>(null);
  private readonly _status = signal<LoadStatus>('idle');
  private readonly _error = signal<string | null>(null);
  private readonly _saving = signal(false);
  private readonly _deleting = signal(false);

  readonly form = this._form.asReadonly();
  readonly status = this._status.asReadonly();
  readonly error = this._error.asReadonly();
  readonly isLoading = computed(() => this._status() === 'loading');
  readonly hasError = computed(() => this._status() === 'error');
  readonly isSaving = this._saving.asReadonly();
  readonly isDeleting = this._deleting.asReadonly();
  /** True on `/products/:id` — the state that has a log and a delete action. */
  readonly isEdit = computed(() => this._form()?.product !== null);

  readonly markets = computed(() => this._form()?.markets ?? []);

  load(vendorSlug: string, productId: string | null): void {
    this.vendorSlug = vendorSlug;
    this.productId = productId;
    this._status.set('loading');
    this._error.set(null);

    this.repo
      .form(vendorSlug, productId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (form) => {
          this._form.set(form);
          this._status.set('ready');
        },
        error: (cause: unknown) => {
          this._form.set(null);
          this._error.set(
            cause instanceof Error ? cause.message : 'That product could not be loaded.',
          );
          this._status.set('error');
        },
      });
  }

  /**
   * Adds or updates, whichever address the form is on. `onDone` is handed the
   * saved product, or `null` when the write was refused — the component decides
   * whether that means navigating away, emptying the fields, or staying put.
   */
  save(draft: ProductDraft, onDone: (saved: VendorProduct | null) => void): void {
    if (this._saving()) return;
    this._saving.set(true);
    this._error.set(null);

    const id = this.productId;
    const request =
      id === null
        ? this.repo.create(this.vendorSlug, draft)
        : this.repo.update(this.vendorSlug, id, draft);

    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (saved) => {
        this._saving.set(false);
        // "Recent changes" is written by the save itself, so an edit that did
        // not re-read would leave the log on screen describing the version
        // before it. Re-read quietly — the screen is already filled in.
        if (id !== null) this.refresh();
        onDone(saved);
      },
      error: (cause: unknown) => {
        this._saving.set(false);
        this._error.set(
          cause instanceof Error ? cause.message : "Those changes didn't save. Try again.",
        );
        onDone(null);
      },
    });
  }

  /**
   * Re-reads the record without going back through the loading state — the
   * form is filled in and staying filled in, so a progress bar here would only
   * flash.
   */
  private refresh(): void {
    const id = this.productId;
    this.repo
      .form(this.vendorSlug, id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (form) => this._form.set(form),
        // The save succeeded; a failed re-read is not worth reporting as one.
        error: () => {},
      });
  }

  /** `onDone(true)` only once the product is really gone. */
  remove(onDone: (removed: boolean) => void): void {
    const id = this.productId;
    if (id === null || this._deleting()) return;
    this._deleting.set(true);

    this.repo
      .remove(this.vendorSlug, id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this._deleting.set(false);
          onDone(true);
        },
        error: (cause: unknown) => {
          this._deleting.set(false);
          this._error.set(
            cause instanceof Error ? cause.message : "That product wasn't deleted. Try again.",
          );
          onDone(false);
        },
      });
  }
}
