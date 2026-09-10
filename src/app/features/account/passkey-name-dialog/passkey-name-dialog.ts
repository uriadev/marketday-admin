import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

/** The backend's column width (`passkeys.name`). */
const NAME_MAX = 60;

export interface PasskeyNameDialogData {
  heading: string;
  /** A line under the heading, when there is something to explain. */
  body?: string;
  name: string;
  /** "Cancel" when renaming; "Skip" straight after adding, where keeping the default is fine. */
  dismissLabel: string;
}

/** A name of only spaces is no name at all. */
function notBlank(control: AbstractControl<string>): ValidationErrors | null {
  return control.value.trim() === '' ? { required: true } : null;
}

/**
 * Names a passkey — straight after it is added, and whenever it is renamed.
 * Closes with the trimmed name, or nothing when dismissed.
 */
@Component({
  selector: 'md-passkey-name-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.heading }}</h2>
    <mat-dialog-content>
      @if (data.body) {
        <p class="m-0 text-body-medium text-on-surface-variant">{{ data.body }}</p>
      }
      <mat-form-field class="mt-4 w-full">
        <mat-label>Name</mat-label>
        <input
          matInput
          [formControl]="name"
          [maxlength]="nameMax"
          placeholder="MacBook, Pixel, security key"
          (keydown.enter)="confirm()"
        />
        @if (name.hasError('maxlength')) {
          <mat-error>Keep it under {{ nameMax }} characters</mat-error>
        } @else {
          <mat-error>Give it a name</mat-error>
        }
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" mat-dialog-close>{{ data.dismissLabel }}</button>
      <button matButton="filled" type="button" (click)="confirm()">Save</button>
    </mat-dialog-actions>
  `,
})
export class PasskeyNameDialog {
  protected readonly data = inject<PasskeyNameDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<PasskeyNameDialog, string>>(MatDialogRef);

  protected readonly nameMax = NAME_MAX;
  protected readonly name = new FormControl(this.data.name, {
    nonNullable: true,
    validators: [notBlank, Validators.maxLength(NAME_MAX)],
  });

  protected confirm(): void {
    if (this.name.invalid) {
      this.name.markAsTouched();
      return;
    }
    this.ref.close(this.name.value.trim());
  }
}
