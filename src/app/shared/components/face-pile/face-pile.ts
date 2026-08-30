import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Avatar } from '../avatar/avatar';

/**
 * Overlapping avatars for a small group — a vendor's staff in the directory
 * (design 1a). Beyond `max` it collapses into a "+N" disc rather than growing.
 */
@Component({
  selector: 'md-face-pile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Avatar],
  template: `
    @for (name of shown(); track name) {
      <md-avatar class="face" [name]="name" [size]="size()" />
    }
    @if (overflow() > 0) {
      <span class="face more" [style.inline-size.px]="size()" [style.block-size.px]="size()"
        >+{{ overflow() }}</span
      >
    }
  `,
  host: {
    '[attr.role]': '"img"',
    '[attr.aria-label]': 'label()',
  },
  styles: `
    :host {
      display: flex;
      align-items: center;
    }
    .face {
      box-shadow: 0 0 0 2px var(--mat-sys-surface-container-lowest);
    }
    .face + .face {
      margin-inline-start: -8px;
    }
    .more {
      display: grid;
      place-items: center;
      flex-shrink: 0;
      border-radius: var(--mat-sys-corner-full);
      background: var(--mat-sys-surface-container-high);
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-label-small);
      font-weight: 700;
    }
  `,
})
export class FacePile {
  readonly names = input.required<readonly string[]>();
  readonly max = input(3);
  readonly size = input(28);

  protected readonly shown = computed(() => this.names().slice(0, this.max()));
  protected readonly overflow = computed(() => Math.max(0, this.names().length - this.max()));
  protected readonly label = computed(() => {
    const count = this.names().length;
    return `${count} ${count === 1 ? 'person' : 'people'}: ${this.names().join(', ')}`;
  });
}
