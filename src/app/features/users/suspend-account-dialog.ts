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
import { Account } from '../../core/models/account.model';

export interface SuspendAccountDialogData {
  accounts: readonly Account[];
}

/** A reason of only spaces is no reason at all. */
function notBlank(control: AbstractControl<string>): ValidationErrors | null {
  return control.value.trim() === '' ? { required: true } : null;
}

/**
 * Closes one or more accounts and records why (design 1i: "Suspending always
 * asks for a reason and writes to the audit log").
 *
 * The reason is required because suspension is the one action here that takes
 * something away from a person who is not in the room. It is what an appeal
 * gets answered from, and the only thing left after the name and email are
 * redacted from the list.
 */
@Component({
  selector: 'md-suspend-account-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ title }}</h2>
    <mat-dialog-content>
      <p class="m-0 text-body-medium text-on-surface-variant">
        {{ subject }} will be signed out and unable to sign in again. Their name and email are
        hidden from this list, and the reason below is written to the audit log.
      </p>
      <mat-form-field class="mt-4 w-full">
        <mat-label>Reason</mat-label>
        <textarea
          matInput
          rows="3"
          [formControl]="reason"
          placeholder="Repeated no-shows on collected pre-orders."
        ></textarea>
        <mat-error>Say why the account is being suspended</mat-error>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" mat-dialog-close>Cancel</button>
      <button matButton="filled" type="button" (click)="confirm()">{{ confirmLabel }}</button>
    </mat-dialog-actions>
  `,
})
export class SuspendAccountDialog {
  protected readonly data = inject<SuspendAccountDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<SuspendAccountDialog, string>>(MatDialogRef);

  protected readonly reason = new FormControl('', { nonNullable: true, validators: notBlank });

  private get count(): number {
    return this.data.accounts.length;
  }

  protected get title(): string {
    return this.count === 1 ? 'Suspend this account' : `Suspend ${this.count} accounts`;
  }

  protected get confirmLabel(): string {
    return this.count === 1 ? 'Suspend account' : `Suspend ${this.count} accounts`;
  }

  /** One name reads better than "1 account"; past that, a count does. */
  protected get subject(): string {
    const first = this.data.accounts[0];
    if (this.count === 1 && first) return first.name;
    return `${this.count} accounts`;
  }

  protected confirm(): void {
    if (this.reason.invalid) {
      this.reason.markAsTouched();
      return;
    }
    this.ref.close(this.reason.value.trim());
  }
}
