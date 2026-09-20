import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MarketRepository } from '../../../core/api/ports/market-repository';
import { MarketStatus, MarketSummary } from '../../../core/models/market.model';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { StatusPill } from '../../../shared/components/status-pill/status-pill';

export interface AddMarketDialogData {
  /** The vendor being placed, named in the title. */
  vendorName: string;
  /** Markets it already trades at — offering one again would be a no-op. */
  joinedSlugs: readonly string[];
}

/**
 * Picks a market to put a vendor on (design 1b's *Add to a market*).
 *
 * The mirror of the markets side's `AddVendorDialog`, and narrower for a
 * reason: the market directory is small enough to hand over whole — which is
 * why `MarketRepository.list()` takes no filters at all — so this one reads
 * once and narrows in a `computed`, the same way the invite screen's market
 * picker does. No round trip per keystroke.
 *
 * It writes nothing; it answers with the market that was picked and the tab
 * sends the mutation.
 */
@Component({
  selector: 'md-add-market-dialog',
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
  ],
  template: `
    <h2 mat-dialog-title>Add {{ data.vendorName }} to a market</h2>

    <mat-dialog-content>
      <mat-form-field subscriptSizing="dynamic" class="w-full">
        <mat-label>Search markets</mat-label>
        <mat-icon matPrefix>search</mat-icon>
        <input
          matInput
          type="search"
          autocomplete="off"
          placeholder="Market or county"
          [value]="query()"
          (input)="onSearch($event)"
        />
      </mat-form-field>

      @if (error(); as message) {
        <p class="mt-4 mb-0 text-body-medium text-error" role="alert">{{ message }}</p>
      } @else if (options().length === 0) {
        <p class="mt-4 mb-0 text-body-medium text-on-surface-variant">
          @if (query().trim() === '') {
            {{ data.vendorName }} already trades at every market on MarketDay.
          } @else {
            No other market matches “{{ query() }}”.
          }
        </p>
      } @else {
        <mat-selection-list
          [multiple]="false"
          aria-label="Markets to join"
          (selectionChange)="picked.set($event.options[0].value)"
        >
          @for (market of options(); track market.slug) {
            <mat-list-option [value]="market" lines="2">
              <md-avatar matListItemAvatar [name]="market.name" [size]="40" shape="rounded" />
              <span matListItemTitle>
                {{ market.name }}
                @if (market.status === MarketStatus.Draft) {
                  <md-status-pill tone="warn">Draft</md-status-pill>
                }
              </span>
              <span matListItemLine>{{ market.when }}</span>
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
export class AddMarketDialog {
  protected readonly data = inject<AddMarketDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<AddMarketDialog, MarketSummary>>(MatDialogRef);
  private readonly repo = inject(MarketRepository);

  /** Read in the template, so the draft pill names the enum, not a string. */
  protected readonly MarketStatus = MarketStatus;

  protected readonly query = signal('');
  protected readonly picked = signal<MarketSummary | null>(null);
  protected readonly error = signal<string | null>(null);

  private readonly markets = toSignal(
    this.repo.list().pipe(
      catchError((cause: unknown) => {
        this.error.set(
          cause instanceof Error ? cause.message : 'Those markets could not be loaded.',
        );
        return of<readonly MarketSummary[]>([]);
      }),
    ),
    { initialValue: [] as readonly MarketSummary[] },
  );

  /**
   * What is left to pick. A market the vendor already trades at is dropped:
   * joining it again is a no-op server-side, so offering it would promise
   * something that does not happen.
   */
  protected readonly options = computed(() => {
    const joined = new Set(this.data.joinedSlugs);
    const needle = this.query().trim().toLowerCase();
    return this.markets().filter(
      (market) =>
        !joined.has(market.slug) &&
        (needle === '' ||
          market.name.toLowerCase().includes(needle) ||
          market.county.toLowerCase().includes(needle)),
    );
  });

  protected onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.picked.set(null);
  }

  protected confirm(): void {
    const market = this.picked();
    if (market) this.ref.close(market);
  }
}
