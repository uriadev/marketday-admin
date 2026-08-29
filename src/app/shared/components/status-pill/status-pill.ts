import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type PillTone = 'positive' | 'muted';

/**
 * A small rounded status chip — "Trading", "Opens 09:00". Not a `mat-chip`
 * (those are interactive/removable); this is a read-only label that recurs
 * across the console's tables and cards.
 */
@Component({
  selector: 'md-status-pill',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  host: {
    '[class.tone-positive]': 'tone() === "positive"',
    '[class.tone-muted]': 'tone() === "muted"',
  },
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      height: 26px;
      padding-inline: 10px;
      border-radius: var(--mat-sys-corner-small);
      font: var(--mat-sys-label-large);
      font-weight: 700;
      white-space: nowrap;
    }
    :host.tone-positive {
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
    }
    :host.tone-muted {
      border: 1px solid var(--mat-sys-outline-variant);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class StatusPill {
  readonly tone = input<PillTone>('positive');
}
