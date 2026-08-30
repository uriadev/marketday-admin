import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type PillTone = 'positive' | 'muted' | 'warn' | 'alert';

/**
 * A small rounded status chip — "Trading", "Opens 09:00", "Draft". Not a
 * `mat-chip` (those are interactive/removable); this is a read-only label that
 * recurs across the console's tables and cards. `warn` is the attention tone —
 * a draft market, an unpaid stall fee.
 */
@Component({
  selector: 'md-status-pill',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  host: {
    '[class.tone-positive]': 'tone() === "positive"',
    '[class.tone-muted]': 'tone() === "muted"',
    '[class.tone-warn]': 'tone() === "warn"',
    '[class.tone-alert]': 'tone() === "alert"',
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
    :host.tone-warn {
      background: var(--mat-sys-tertiary-container);
      color: var(--mat-sys-on-tertiary-container);
    }
    :host.tone-alert {
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }
  `,
})
export class StatusPill {
  readonly tone = input<PillTone>('positive');
}
