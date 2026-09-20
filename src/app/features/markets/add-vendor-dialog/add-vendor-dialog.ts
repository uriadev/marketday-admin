import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  map,
  switchMap,
  tap,
} from 'rxjs/operators';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { VendorRepository } from '../../../core/api/ports/vendor-repository';
import { EMPTY_VENDOR_FILTERS, VendorSummary } from '../../../core/models/vendor.model';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { StatusPill } from '../../../shared/components/status-pill/status-pill';

export interface AddVendorDialogData {
  /** The market being added to, named in the title and the button. */
  marketName: string;
  /** Vendors already on the roster — offering one again would be a no-op. */
  onRosterSlugs: readonly string[];
}

/** Enough to choose from without scrolling the dialog to its limit. */
const RESULT_LIMIT = 20;

/**
 * Picks a vendor that already exists, to put on a market's roster (design 1g).
 *
 * The counterpart to *Invite vendor*, which creates a business from scratch:
 * this one only ever adds an existing record, so there is nothing to fill in
 * beyond which vendor.
 *
 * Unlike the other dialogs in this console it **reads** — the directory runs to
 * hundreds of rows, so it cannot be handed its options the way a fee waiver or
 * a passkey rename can. The search is pushed down to `adminVendors` as a name
 * filter, so what is typed narrows the directory rather than the twenty rows
 * last fetched. It still writes nothing: it answers with the vendor that was
 * picked and the caller sends the mutation, which is what keeps a dialog from
 * being able to half-do a write.
 *
 * A deactivated vendor is offered, with its pill: an admin adding one is
 * usually setting a market up ahead of switching the vendor on, and hiding it
 * would leave them wondering why the search finds nothing.
 */
@Component({
  selector: 'md-add-vendor-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Avatar,
    StatusPill,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatProgressBarModule,
  ],
  template: `
    <h2 mat-dialog-title>Add a vendor to {{ data.marketName }}</h2>

    <mat-dialog-content>
      <mat-form-field subscriptSizing="dynamic" class="w-full">
        <mat-label>Search vendors</mat-label>
        <mat-icon matPrefix>search</mat-icon>
        <input
          matInput
          type="search"
          autocomplete="off"
          placeholder="Business name"
          [value]="query()"
          (input)="onSearch($event)"
        />
      </mat-form-field>

      @if (isSearching()) {
        <mat-progress-bar mode="indeterminate" aria-label="Searching vendors" />
      }

      @if (error(); as message) {
        <p class="mt-4 mb-0 text-body-medium text-error" role="alert">{{ message }}</p>
      } @else if (options().length === 0) {
        <p class="mt-4 mb-0 text-body-medium text-on-surface-variant">
          @if (query().trim() === '') {
            Every vendor MarketDay knows already trades here.
          } @else {
            No other vendor matches “{{ query() }}”.
          }
        </p>
      } @else {
        <mat-selection-list
          [multiple]="false"
          aria-label="Vendors to add"
          (selectionChange)="picked.set($event.options[0].value)"
        >
          @for (vendor of options(); track vendor.slug) {
            <mat-list-option [value]="vendor" lines="2">
              <md-avatar matListItemAvatar [name]="vendor.name" [size]="40" />
              <span matListItemTitle>
                {{ vendor.name }}
                @if (!vendor.isActive) {
                  <md-status-pill tone="muted">Paused</md-status-pill>
                }
              </span>
              <span matListItemLine>{{ meta(vendor) }}</span>
            </mat-list-option>
          }
        </mat-selection-list>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button matButton type="button" mat-dialog-close>Cancel</button>
      <button matButton="filled" type="button" [disabled]="!picked()" (click)="confirm()">
        Add to market
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    mat-dialog-content {
      min-height: 220px;
    }
    md-status-pill {
      margin-inline-start: 8px;
      vertical-align: middle;
    }
  `,
})
export class AddVendorDialog {
  protected readonly data = inject<AddVendorDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<AddVendorDialog, VendorSummary>>(MatDialogRef);
  private readonly repo = inject(VendorRepository);

  protected readonly query = signal('');
  protected readonly picked = signal<VendorSummary | null>(null);
  protected readonly isSearching = signal(true);
  protected readonly error = signal<string | null>(null);

  /**
   * One page of the directory for what is typed. Debounced because every
   * keystroke is a round trip; `switchMap` so a slower earlier answer cannot
   * land on top of a later one.
   */
  private readonly results = toSignal(
    toObservable(this.query).pipe(
      debounceTime(250),
      distinctUntilChanged(),
      tap(() => {
        this.isSearching.set(true);
        this.error.set(null);
      }),
      switchMap((q) =>
        this.repo
          .list({
            filters: { ...EMPTY_VENDOR_FILTERS, q },
            page: { index: 0, size: RESULT_LIMIT },
          })
          .pipe(
            map((page) => page.items),
            catchError((cause: unknown) => {
              this.error.set(
                cause instanceof Error ? cause.message : 'Those vendors could not be loaded.',
              );
              return of<readonly VendorSummary[]>([]);
            }),
          ),
      ),
      tap(() => this.isSearching.set(false)),
    ),
    { initialValue: [] as readonly VendorSummary[] },
  );

  /**
   * A vendor already on the roster is dropped rather than shown as picked:
   * adding it again is a no-op server-side, so offering it would promise
   * something that does not happen.
   */
  protected readonly options = computed(() => {
    const onRoster = new Set(this.data.onRosterSlugs);
    return this.results().filter((vendor) => !onRoster.has(vendor.slug));
  });

  protected onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.picked.set(null);
  }

  /** "Cheese · since 2018 · Temple Bar, Howth" — what it is and where else. */
  protected meta(vendor: VendorSummary): string {
    const where = vendor.markets.length > 0 ? vendor.markets.join(', ') : 'No markets yet';
    return `${vendor.meta} · ${where}`;
  }

  protected confirm(): void {
    const vendor = this.picked();
    if (vendor) this.ref.close(vendor);
  }
}
