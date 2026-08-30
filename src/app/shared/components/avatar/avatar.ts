import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type AvatarShape = 'circle' | 'rounded';
export type AvatarTone = 'accent' | 'muted';

/**
 * A person or business, before their photo exists: their initials on a tinted
 * ground. `rounded` is the square-ish variant the design uses for markets and
 * vendors, `circle` the one it uses for people.
 */
@Component({
  selector: 'md-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (src(); as image) {
      <img class="image" [src]="image" alt="" />
    } @else {
      {{ initials() }}
    }
  `,
  host: {
    '[style.inline-size.px]': 'size()',
    '[style.block-size.px]': 'size()',
    '[style.font-size.px]': 'size() * 0.36',
    '[style.border-radius]': 'radius()',
    '[class.tone-muted]': 'tone() === "muted"',
    '[class.outlined]': 'outlined()',
    '[attr.aria-hidden]': '"true"',
  },
  styles: `
    :host {
      display: grid;
      place-items: center;
      flex-shrink: 0;
      overflow: hidden;
      font-weight: 700;
      line-height: 1;
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
    }
    .image {
      inline-size: 100%;
      block-size: 100%;
      object-fit: cover;
    }
    :host.tone-muted {
      background: var(--mat-sys-surface-container-high);
      color: var(--mat-sys-on-surface-variant);
    }
    /* Someone invited but not signed up yet — an outline, not a filled face. */
    :host.outlined {
      background: transparent;
      border: 1px dashed var(--mat-sys-outline);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class Avatar {
  readonly name = input.required<string>();
  readonly size = input(40);
  readonly shape = input<AvatarShape>('circle');
  readonly tone = input<AvatarTone>('accent');
  /** Draws the face as a dashed outline — a placeholder for someone not yet here. */
  readonly outlined = input(false);
  /** Picture to show instead of initials — a market's cover, a vendor's logo. */
  readonly src = input<string | null>(null);

  protected readonly radius = computed(() =>
    this.shape() === 'circle' ? 'var(--mat-sys-corner-full)' : 'var(--mat-sys-corner-medium)',
  );

  protected readonly initials = computed(() =>
    this.name()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] ?? '')
      .join('')
      .toUpperCase(),
  );
}
