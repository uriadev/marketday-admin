import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

export interface DeleteProductDialogData {
  productName: string;
  /** "Temple Bar Food Market and Marlay Park Market", or "" when carried nowhere. */
  where: string;
}

/**
 * Confirms the one destructive action on the product form (design 4a). It names
 * the markets the product comes off, because that — not the record itself — is
 * what a shopper notices, and it says what survives: past orders keep their
 * line, so deleting is not a way to erase what was sold.
 */
@Component({
  selector: 'md-delete-product-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>Delete {{ data.productName }}?</h2>
    <mat-dialog-content>
      <p class="m-0 text-body-medium text-on-surface-variant">
        @if (data.where) {
          Removes it from {{ data.where }} straight away. Past orders keep their record.
        } @else {
          Removes it from this vendor’s list. It is not carried at any market, so no shopper view
          changes. Past orders keep their record.
        }
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" mat-dialog-close>Keep it</button>
      <button matButton="filled" type="button" (click)="confirm()">Delete product</button>
    </mat-dialog-actions>
  `,
})
export class DeleteProductDialog {
  protected readonly data = inject<DeleteProductDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<DeleteProductDialog, boolean>>(MatDialogRef);

  protected confirm(): void {
    this.ref.close(true);
  }
}
