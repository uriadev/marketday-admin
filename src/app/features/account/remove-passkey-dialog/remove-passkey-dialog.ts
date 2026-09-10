import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

export interface RemovePasskeyDialogData {
  name: string;
}

/**
 * Confirms removing a passkey. It says what does *not* happen, because that is
 * what surprises people: the passkey stays in the device's keychain, and the
 * browser keeps offering it until it is deleted there too — offered, it is
 * refused. Signing in with a password is untouched.
 */
@Component({
  selector: 'md-remove-passkey-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>Remove “{{ data.name }}”?</h2>
    <mat-dialog-content>
      <p class="m-0 text-body-medium text-on-surface-variant">
        It stops signing you in to MarketDay straight away. Your device keeps the passkey until you
        delete it in its password manager, but MarketDay will turn it away. Your password still
        works.
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" mat-dialog-close>Keep it</button>
      <button matButton="filled" type="button" (click)="confirm()">Remove passkey</button>
    </mat-dialog-actions>
  `,
})
export class RemovePasskeyDialog {
  protected readonly data = inject<RemovePasskeyDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<RemovePasskeyDialog, boolean>>(MatDialogRef);

  protected confirm(): void {
    this.ref.close(true);
  }
}
