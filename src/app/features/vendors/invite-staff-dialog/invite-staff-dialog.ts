import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { VendorStaffInvite } from '../../../core/models/vendor.model';
import { StaffMarketOption } from '../staff-market-option';

export interface InviteStaffDialogData {
  vendorName: string;
  /** The markets this vendor trades at — a seat is pinned to exactly one. */
  markets: readonly StaffMarketOption[];
}

/**
 * Offers someone a seat on a vendor's team (design 1c's *Invite staff
 * member*).
 *
 * Two fields, because a staff seat is two facts: who, and which stall. The
 * market is **not** optional and there is no "all markets" choice —
 * `vendor_members` pins a `STAFF` row to one market by check constraint, and
 * spanning every market is what being the owner means. A vendor that trades
 * nowhere has nobody to invite, which is why the tab does not open this at all
 * until it has a stall.
 *
 * Presentational, like the other dialogs here: data in, the invitation out,
 * nothing injected and nothing written. The tab owns the call, so a dialog
 * cannot half-send one.
 */
@Component({
  selector: 'md-invite-staff-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  template: `
    <h2 mat-dialog-title>Invite someone to {{ data.vendorName }}</h2>
    <mat-dialog-content>
      <p class="m-0 text-body-medium text-on-surface-variant">
        They get an email with a code to sign in with. Nothing changes on the team until they use it
        — until then the row reads “Invitation pending”, and you can withdraw it.
      </p>

      <form [formGroup]="form" class="mt-4 flex flex-col">
        <mat-form-field class="w-full">
          <mat-label>Email address</mat-label>
          <input
            matInput
            type="email"
            formControlName="email"
            autocomplete="off"
            placeholder="name@example.ie"
          />
          <mat-error>Enter the email address to invite</mat-error>
        </mat-form-field>

        <mat-form-field class="w-full">
          <mat-label>Market they will work at</mat-label>
          <mat-select formControlName="marketSlug">
            @for (market of data.markets; track market.slug) {
              <mat-option [value]="market.slug">{{ market.name }}</mat-option>
            }
          </mat-select>
          <mat-hint>Stallholders see orders for this market only.</mat-hint>
          <mat-error>Pick the market they will man</mat-error>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" mat-dialog-close>Cancel</button>
      <button matButton="filled" type="button" (click)="confirm()">Send invitation</button>
    </mat-dialog-actions>
  `,
})
export class InviteStaffDialog {
  protected readonly data = inject<InviteStaffDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<InviteStaffDialog, VendorStaffInvite>>(MatDialogRef);

  protected readonly form = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    // Pre-picked when there is only one stall to pick: asking a question with
    // one answer is not a question.
    marketSlug: new FormControl(this.data.markets.length === 1 ? this.data.markets[0].slug : '', {
      nonNullable: true,
      validators: Validators.required,
    }),
  });

  protected confirm(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { email, marketSlug } = this.form.getRawValue();
    this.ref.close({ email: email.trim(), marketSlug });
  }
}
