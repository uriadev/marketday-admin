import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  ReactiveFormsModule,
  ValidationErrors,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { StallPayment } from '../../core/models/payment.model';

export interface WaiveFeeDialogData {
  payment: StallPayment;
  vendorName: string;
}

/** A reason of only spaces is no reason at all. */
function notBlank(control: AbstractControl<string>): ValidationErrors | null {
  return control.value.trim() === '' ? { required: true } : null;
}

/**
 * Cancels one invoice and records why (design 2b). A waiver is the one money
 * action with no trail of its own — no charge, no refund, nothing at the card
 * processor — so the reason is required rather than optional: it is the only
 * record that the fee was ever owed.
 */
@Component({
  selector: 'md-waive-fee-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  template: `
    <h2 mat-dialog-title>Waive this fee</h2>
    <mat-dialog-content>
      <p class="m-0 text-body-medium text-on-surface-variant">
        Cancels {{ amount }} for {{ data.vendorName }} at {{ data.payment.market }} ({{
          data.payment.period
        }}) and records the reason against the membership. Organisers see the waiver on their sheet.
      </p>
      <mat-form-field class="mt-4 w-full">
        <mat-label>Reason</mat-label>
        <textarea
          matInput
          rows="3"
          [formControl]="reason"
          placeholder="Market paused for the month, agreed with the organiser."
        ></textarea>
        <mat-error>Say why the fee is being waived</mat-error>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" mat-dialog-close>Cancel</button>
      <button matButton="filled" type="button" (click)="confirm()">Waive the fee</button>
    </mat-dialog-actions>
  `,
})
export class WaiveFeeDialog {
  protected readonly data = inject<WaiveFeeDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<WaiveFeeDialog, string>>(MatDialogRef);

  protected readonly reason = new FormControl('', {
    nonNullable: true,
    validators: notBlank,
  });

  protected get amount(): string {
    return `€${Math.round(Math.abs(this.data.payment.amount))}`;
  }

  protected confirm(): void {
    if (this.reason.invalid) {
      this.reason.markAsTouched();
      return;
    }
    this.ref.close(this.reason.value.trim());
  }
}
