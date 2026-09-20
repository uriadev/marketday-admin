import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

export interface ConfirmDialogData {
  /** Names the thing being done — "Remove McNally Family Farm from Temple Bar?". */
  title: string;
  /** What it costs, in a sentence or two. The reason this dialog exists. */
  body: string;
  /** The verb on the confirming button — "Remove from market". */
  confirmLabel: string;
  /** The wording that walks away. Defaults to "Cancel". */
  cancelLabel?: string;
}

/**
 * Asks before something that cannot be undone by repeating it.
 *
 * In `shared/` rather than in a feature because two features ask the same
 * question — a market's Vendors tab and a vendor's Markets tab each remove a
 * stall, and features may not import each other
 * (`../../../../../docs/ARCHITECTURE.md` §1).
 *
 * Presentational, like every other dialog here: data in, a boolean out,
 * nothing injected, nothing written. The caller owns the write, so the dialog
 * cannot half-do one. `DeleteProductDialog` stays as it is — its copy branches
 * on the product's markets, which is more than a title and a body.
 */
@Component({
  selector: 'md-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p class="m-0 text-body-medium text-on-surface-variant">{{ data.body }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" mat-dialog-close>{{ data.cancelLabel ?? 'Cancel' }}</button>
      <button matButton="filled" type="button" (click)="confirm()">{{ data.confirmLabel }}</button>
    </mat-dialog-actions>
  `,
})
export class ConfirmDialog {
  protected readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<ConfirmDialog, boolean>>(MatDialogRef);

  protected confirm(): void {
    this.ref.close(true);
  }
}
