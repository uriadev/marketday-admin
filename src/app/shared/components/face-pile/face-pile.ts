import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Avatar } from '../avatar/avatar';

/**
 * Overlapping avatars for a small group — a vendor's staff in the directory
 * (design 1a). Beyond `max` it collapses into a "+N" disc rather than growing.
 *
 * `count` is the authoritative headcount for when the roster is known only by
 * its size: the vendor directory's real-API path has "5 staff" without the five
 * names. Given `count` and no `names`, the pile draws that many faceless discs.
 */
@Component({
  selector: 'md-face-pile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Avatar],
  template: `
    @for (name of shown(); track $index) {
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
  /** Team size when it is bigger than what `names` lists — e.g. the roster is
   *  not loaded, only its count. Defaults to `names.length`. */
  readonly count = input<number>();
  readonly max = input(3);
  readonly size = input(28);

  private readonly total = computed(() => this.count() ?? this.names().length);

  protected readonly shown = computed(() => {
    const names = this.names();
    if (names.length > 0) return names.slice(0, this.max());
    // Known headcount, unknown people — placeholder discs.
    return Array.from({ length: Math.min(this.total(), this.max()) }, () => '');
  });
  protected readonly overflow = computed(() => Math.max(0, this.total() - this.max()));
  protected readonly label = computed(() => {
    const count = this.total();
    const noun = count === 1 ? 'person' : 'people';
    const names = this.names();
    return names.length > 0 ? `${count} ${noun}: ${names.join(', ')}` : `${count} ${noun}`;
  });
}
