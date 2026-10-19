import { DestroyRef, Injectable, Signal, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subject, of } from 'rxjs';
import { catchError, finalize, switchMap } from 'rxjs/operators';
import { PromotionRepository } from '../../core/api/ports/promotion-repository';
import { PickerOption } from '../../core/models/picker-option.model';
import {
  LatLng,
  PromotionDraft,
  PromotionForm,
  PromotionPrefill,
  PromotionRecord,
  PromotionStatus,
  PromotionTargetKind,
} from '../../core/models/promotion.model';
import { LoadStatus } from '../../core/state/collection-store';

/** One search-as-you-type picker's state: the latest answer wins. */
export interface SearchChannel {
  readonly options: Signal<readonly PickerOption[]>;
  readonly loading: Signal<boolean>;
  search(query: string): void;
}

/**
 * The one promotion behind the promotion form, for both of its addresses, and
 * the reads its pickers need. Provided by the component.
 *
 * The status never moves through {@link save}: on an existing promotion it
 * goes through {@link setStatus} alone, so a form save can never resume a
 * promotion someone paused over a complaint.
 */
@Injectable()
export class PromotionFormFacade {
  private readonly repo = inject(PromotionRepository);
  private readonly destroyRef = inject(DestroyRef);

  private promotionId: string | null = null;

  private readonly _form = signal<PromotionForm | null>(null);
  private readonly _status = signal<LoadStatus>('idle');
  private readonly _error = signal<string | null>(null);
  private readonly _saving = signal(false);
  private readonly _products = signal<readonly PickerOption[]>([]);
  private readonly _loadingProducts = signal(false);

  readonly form = this._form.asReadonly();
  readonly promotion = computed(() => this._form()?.promotion ?? null);
  readonly markets = computed(() => this._form()?.markets ?? []);
  readonly prefilled = computed(() => this._form()?.prefilled ?? null);
  readonly isLoading = computed(() => this._status() === 'loading');
  readonly hasError = computed(() => this._status() === 'error');
  readonly error = this._error.asReadonly();
  readonly isSaving = this._saving.asReadonly();
  readonly products = this._products.asReadonly();
  readonly loadingProducts = this._loadingProducts.asReadonly();

  /** Events for an event subject. */
  readonly events = this.channel((query) => this.repo.searchSubjects('event', query));
  /** Vendors for a vendor subject, or the vendor whose product is promoted. */
  readonly vendors = this.channel((query) => this.repo.searchSubjects('vendor', query));
  /** Vendors for the sponsor — a separate panel from the subject's. */
  readonly sponsors = this.channel((query) => this.repo.searchSubjects('vendor', query));

  load(id: string | null, prefill: PromotionPrefill | null): void {
    this.promotionId = id;
    this._status.set('loading');
    this._error.set(null);
    this.repo
      .form(id, prefill)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (form) => {
          this._form.set(form);
          this._status.set('ready');
        },
        error: (cause: unknown) => {
          this._form.set(null);
          this._error.set(
            cause instanceof Error ? cause.message : 'That promotion could not be loaded.',
          );
          this._status.set('error');
        },
      });
  }

  /** The products of the vendor picked for a product subject. */
  loadProducts(vendorId: string | null): void {
    this._products.set([]);
    if (vendorId === null) return;
    this._loadingProducts.set(true);
    this.repo
      .productsOf(vendorId)
      .pipe(
        catchError(() => of<readonly PickerOption[]>([])),
        finalize(() => this._loadingProducts.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((products) => this._products.set(products));
  }

  /** Where a reach around the subject should be centred; `null` when it has no point. */
  suggestedReach(kind: PromotionTargetKind, id: string, onDone: (point: LatLng | null) => void): void {
    if (kind === 'market') {
      onDone(this.markets().find((market) => market.id === id)?.location ?? null);
      return;
    }
    this.repo
      .suggestedReach(kind, id)
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(onDone);
  }

  save(draft: PromotionDraft, onDone: (saved: PromotionRecord | null) => void): void {
    const id = this.promotionId;
    this.write(id === null ? this.repo.create(draft) : this.repo.update(id, draft), onDone);
  }

  /** Schedule, pause, resume or draft — acts at once, apart from the form. */
  setStatus(status: PromotionStatus, onDone: (saved: PromotionRecord | null) => void): void {
    const id = this.promotionId;
    if (id === null) return;
    this.write(this.repo.setStatus(id, status), onDone);
  }

  remove(onDone: (removed: boolean) => void): void {
    const id = this.promotionId;
    if (id === null || this._saving()) return;
    this._saving.set(true);
    this.repo
      .remove(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this._saving.set(false);
          onDone(true);
        },
        error: (cause: unknown) => {
          this.refuse(cause, "That promotion wasn't deleted. Try again.");
          onDone(false);
        },
      });
  }

  private write(
    request: Observable<PromotionRecord>,
    onDone: (saved: PromotionRecord | null) => void,
  ): void {
    if (this._saving()) return;
    this._saving.set(true);
    this._error.set(null);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (saved) => {
        this._saving.set(false);
        this._form.update((form) => (form ? { ...form, promotion: saved } : form));
        onDone(saved);
      },
      error: (cause: unknown) => {
        this.refuse(cause, "Those changes didn't save. Try again.");
        onDone(null);
      },
    });
  }

  private refuse(cause: unknown, fallback: string): void {
    this._saving.set(false);
    this._error.set(cause instanceof Error ? cause.message : fallback);
  }

  private channel(read: (query: string) => Observable<readonly PickerOption[]>): SearchChannel {
    const options = signal<readonly PickerOption[]>([]);
    const loading = signal(false);
    const queries = new Subject<string>();
    queries
      .pipe(
        switchMap((query) => {
          loading.set(true);
          return read(query).pipe(
            catchError(() => of<readonly PickerOption[]>([])),
            finalize(() => loading.set(false)),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((answer) => options.set(answer));
    return {
      options: options.asReadonly(),
      loading: loading.asReadonly(),
      search: (query) => queries.next(query),
    };
  }
}
