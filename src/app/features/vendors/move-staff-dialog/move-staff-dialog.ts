import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { StaffMarketOption } from '../staff-market-option';

export interface MoveStaffDialogData {
  personName: string;
  vendorName: string;
  markets: readonly StaffMarketOption[];
  /** The stall they are on now, pre-selected so the dialog opens on the truth. */
  currentSlug: string | null;
}

/**
 * Moves a stallholder to a different one of the vendor's markets (design 1c's
 * *Change market*).
 *
 * A move rather than an addition, and the copy says so: one person holds one
 * seat, so giving them Marlay Park takes Temple Bar away. Somebody who needs
 * both is an owner, or two accounts.
 */
@Component({
  selector: 'md-move-staff-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatSelectModule,
  ],
  template: `
    <h2 mat-dialog-title>Move {{ data.personName }} to another market</h2>
    <mat-dialog-content>
      <p class="m-0 text-body-medium text-on-surface-variant">
        A stallholder works one market at a time, so this replaces the one they are on rather than
        adding to it. They lose sight of {{ data.vendorName }}’s orders there as soon as it saves.
      </p>

      <mat-form-field class="mt-4 w-full">
        <mat-label>Market</mat-label>
        <mat-select [formControl]="marketSlug">
          @for (market of data.markets; track market.slug) {
            <mat-option [value]="market.slug">{{ market.name }}</mat-option>
          }
        </mat-select>
        <mat-error>Pick the market they will man</mat-error>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" mat-dialog-close>Cancel</button>
      <button matButton="filled" type="button" (click)="confirm()">Move them</button>
    </mat-dialog-actions>
  `,
})
export class MoveStaffDialog {
  protected readonly data = inject<MoveStaffDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<MoveStaffDialog, string>>(MatDialogRef);

  protected readonly marketSlug = new FormControl(this.data.currentSlug ?? '', {
    nonNullable: true,
    validators: Validators.required,
  });

  protected confirm(): void {
    if (this.marketSlug.invalid) {
      this.marketSlug.markAsTouched();
      return;
    }
    this.ref.close(this.marketSlug.value);
  }
}
