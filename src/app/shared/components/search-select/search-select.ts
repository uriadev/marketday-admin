import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { PickerOption } from '../../../core/models/picker-option.model';

/** Long enough to let a name be typed, short enough not to feel like lag. */
const QUERY_DEBOUNCE_MS = 250;

/**
 * Search-as-you-type for one record — a vendor, an event, a product. It is for
 * collections too large to hand a `mat-select` whole.
 *
 * Presentation only: it emits what was typed (`query`, debounced, and once on
 * focus so the panel opens with something in it) and what was picked, and
 * renders whatever `options` it is given. The owner reads the repository and
 * stores the id, which is what keeps a picker from being able to write.
 */
@Component({
  selector: 'md-search-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatAutocompleteModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <mat-form-field class="w-full" [subscriptSizing]="hint() || error() ? 'fixed' : 'dynamic'">
      <mat-label>{{ label() }}</mat-label>
      <mat-icon matPrefix>search</mat-icon>
      <input
        matInput
        type="search"
        autocomplete="off"
        [placeholder]="placeholder()"
        [value]="text()"
        [disabled]="disabled()"
        [matAutocomplete]="panel"
        (input)="onInput($event)"
        (focus)="onFocus()"
      />
      @if (loading()) {
        <mat-spinner matSuffix diameter="20" aria-label="Searching" />
      } @else if (selected() && !disabled()) {
        <button matIconButton matSuffix type="button" aria-label="Clear" (click)="clear()">
          <mat-icon>close</mat-icon>
        </button>
      }
      @if (error()) {
        <mat-error>{{ error() }}</mat-error>
      } @else if (hint()) {
        <mat-hint>{{ hint() }}</mat-hint>
      }
      <mat-autocomplete
        #panel="matAutocomplete"
        [displayWith]="display"
        (optionSelected)="onPicked($event)"
      >
        @for (option of options(); track option.id) {
          <mat-option [value]="option">
            <span class="block">{{ option.label }}</span>
            @if (option.detail) {
              <span class="block text-label-medium text-on-surface-variant">
                {{ option.detail }}
              </span>
            }
          </mat-option>
        } @empty {
          @if (!loading()) {
            <mat-option disabled>{{ emptyText() }}</mat-option>
          }
        }
      </mat-autocomplete>
    </mat-form-field>
  `,
})
export class SearchSelect {
  readonly label = input.required<string>();
  readonly placeholder = input('');
  readonly options = input<readonly PickerOption[]>([]);
  /** The current choice; its label fills the field. */
  readonly selected = input<PickerOption | null>(null);
  readonly loading = input(false);
  readonly disabled = input(false);
  readonly hint = input('');
  readonly error = input<string | null>(null);
  readonly emptyText = input('Nothing matches');

  readonly query = output<string>();
  readonly picked = output<PickerOption>();
  readonly cleared = output<void>();

  protected readonly text = signal('');
  /** What the trigger writes into the field on a pick — the label, not the object. */
  protected readonly display = (option: PickerOption | string | null): string =>
    typeof option === 'string' ? option : (option?.label ?? '');
  private readonly typed = new Subject<string>();

  constructor() {
    this.typed
      .pipe(
        debounceTime(QUERY_DEBOUNCE_MS),
        distinctUntilChanged(),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((value) => this.query.emit(value));
    // A choice made elsewhere (a seeded form, a prefill link) shows here too.
    effect(() => this.text.set(this.selected()?.label ?? ''));
  }

  protected onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.text.set(value);
    this.typed.next(value);
  }

  /** The panel opens on focus; without a first query it would open empty. */
  protected onFocus(): void {
    this.query.emit(this.selected() ? '' : this.text());
  }

  protected onPicked(event: MatAutocompleteSelectedEvent): void {
    const option = event.option.value as PickerOption;
    this.text.set(option.label);
    this.picked.emit(option);
  }

  protected clear(): void {
    this.text.set('');
    this.cleared.emit();
  }
}
