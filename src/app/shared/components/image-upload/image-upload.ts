import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

const MIME_LABELS: Record<string, string> = {
  'image/png': 'PNG',
  'image/jpeg': 'JPG',
  'image/webp': 'WebP',
  'image/avif': 'AVIF',
};

/**
 * Drop zone + preview for a single image. Presentation only: it validates the
 * picked file against `accept`/`maxSizeMb` as a UI guard, then hands the raw
 * `File` up. Whoever owns the form decides how to upload it and what to do with
 * the rejection message.
 */
@Component({
  selector: 'md-image-upload',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatProgressBarModule],
  template: `
    <div class="md-upload__label-row">
      <span class="md-upload__label" [id]="labelId">{{ label() }}</span>
      @if (src()) {
        <mat-icon class="md-upload__check">check_circle</mat-icon>
      }
    </div>

    <div
      class="md-upload__zone"
      [class.md-upload__zone--over]="isDragOver()"
      [class.md-upload__zone--filled]="!!src()"
      [class.md-upload__zone--disabled]="disabled()"
      [style.aspect-ratio]="aspect()"
      role="button"
      tabindex="0"
      [attr.aria-labelledby]="labelId"
      [attr.aria-disabled]="disabled() || busy()"
      (click)="openPicker()"
      (keydown.enter)="openPicker($event)"
      (keydown.space)="openPicker($event)"
      (dragover)="onDragOver($event)"
      (dragleave)="onDragLeave($event)"
      (drop)="onDrop($event)"
    >
      @if (src(); as preview) {
        <img class="md-upload__preview" [src]="preview" [alt]="label()" />
      } @else {
        <div class="md-upload__empty">
          <mat-icon>add_photo_alternate</mat-icon>
          <span>Drop an image here, or click to choose one</span>
        </div>
      }

      @if (src() && !busy()) {
        <button
          matIconButton
          type="button"
          class="md-upload__remove"
          aria-label="Remove image"
          [disabled]="disabled()"
          (click)="clear($event)"
        >
          <mat-icon>close</mat-icon>
        </button>
      }

      @if (busy()) {
        <mat-progress-bar class="md-upload__progress" mode="indeterminate" />
      }
    </div>

    @if (hint()) {
      <p class="md-upload__hint">{{ hint() }}</p>
    }

    <input
      #picker
      class="md-upload__input"
      type="file"
      [accept]="accept()"
      [disabled]="disabled() || busy()"
      (change)="onPicked($event)"
    />
  `,
  host: { class: 'md-upload' },
  styles: `
    .md-upload {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .md-upload__label-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .md-upload__label {
      font: var(--mat-sys-body-medium);
      font-weight: 600;
      color: var(--mat-sys-on-surface);
    }
    .md-upload__check {
      --mat-icon-color: var(--mat-sys-primary);
      font-size: 18px;
      width: 18px;
      height: 18px;
    }
    .md-upload__zone {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      cursor: pointer;
      border: 1px dashed var(--mat-sys-outline-variant);
      border-radius: 12px;
      background: var(--mat-sys-surface-container-low);
      transition:
        border-color 120ms ease,
        background 120ms ease;
    }
    .md-upload__zone:hover,
    .md-upload__zone:focus-visible {
      border-color: var(--mat-sys-primary);
      outline: none;
    }
    .md-upload__zone--over {
      border-color: var(--mat-sys-primary);
      border-style: solid;
      background: var(--mat-sys-surface-container-high);
    }
    .md-upload__zone--filled {
      border-style: solid;
      background: var(--mat-sys-surface-container);
    }
    .md-upload__zone--disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }
    .md-upload__preview {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .md-upload__empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 12px;
      text-align: center;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .md-upload__progress {
      position: absolute;
      inset: auto 0 0 0;
    }
    .md-upload__remove {
      position: absolute;
      top: 6px;
      right: 6px;
      background: color-mix(in srgb, var(--mat-sys-surface) 78%, transparent);
    }
    .md-upload__hint {
      margin: 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .md-upload__input {
      display: none;
    }
  `,
})
export class ImageUpload {
  private static nextId = 0;

  readonly label = input.required<string>();
  readonly hint = input('');
  /** Current image URL, or `null` for the empty state. */
  readonly src = input<string | null>(null);
  /** CSS `aspect-ratio` for the preview box, e.g. `'16 / 9'`. */
  readonly aspect = input('16 / 9');
  readonly accept = input('image/png,image/jpeg,image/webp');
  readonly maxSizeMb = input(5);
  readonly busy = input(false);
  readonly disabled = input(false);

  readonly selected = output<File>();
  readonly cleared = output<void>();
  /** Human-readable reason a picked file was not accepted. */
  readonly rejected = output<string>();

  private readonly picker = viewChild.required<ElementRef<HTMLInputElement>>('picker');

  protected readonly labelId = `md-upload-${ImageUpload.nextId++}`;
  protected readonly isDragOver = signal(false);

  private readonly acceptedTypes = computed(() =>
    this.accept()
      .split(',')
      .map((type) => type.trim())
      .filter(Boolean),
  );

  protected openPicker(event?: Event): void {
    event?.preventDefault();
    if (this.disabled() || this.busy()) return;
    this.pickerInput().click();
  }

  /** Sits inside the zone, so its click must not also open the picker. */
  protected clear(event?: Event): void {
    event?.stopPropagation();
    this.resetPicker();
    this.cleared.emit();
  }

  protected onPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file && !this.disabled() && !this.busy()) this.handleFile(file);
    // Reset so picking the same file twice still fires `change`.
    input.value = '';
  }

  protected onDragOver(event: DragEvent): void {
    if (this.disabled() || this.busy()) return;
    event.preventDefault();
    this.isDragOver.set(true);
  }

  protected onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver.set(false);
  }

  protected onDrop(event: DragEvent): void {
    if (this.disabled() || this.busy()) return;
    event.preventDefault();
    this.isDragOver.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) this.handleFile(file);
  }

  /** Validate, then hand the file up — or explain why it was turned away. */
  private handleFile(file: File): void {
    const types = this.acceptedTypes();
    if (types.length && !types.includes(file.type)) {
      const names = types.map((type) => MIME_LABELS[type] ?? type);
      const last = names.pop();
      const listed = names.length ? `${names.join(', ')} or ${last}` : last;
      this.rejected.emit(`${this.label()} must be a ${listed} image.`);
      return;
    }
    if (file.size > this.maxSizeMb() * 1024 * 1024) {
      this.rejected.emit(`${this.label()} must be under ${this.maxSizeMb()} MB.`);
      return;
    }
    this.selected.emit(file);
  }

  private pickerInput(): HTMLInputElement {
    return this.picker().nativeElement;
  }

  private resetPicker(): void {
    this.pickerInput().value = '';
  }
}
