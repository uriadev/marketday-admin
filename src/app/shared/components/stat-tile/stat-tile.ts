import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { StatTone } from '../../../core/models/overview.model';

/**
 * One KPI in the Overview grid: a label, a big number, and a supporting line.
 * The `alert` tone swaps to the error container so an overdue count reads at a
 * glance (design 1e).
 */
@Component({
  selector: 'md-stat-tile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="label">{{ label() }}</span>
    <span class="value">{{ value() }}</span>
    <span class="hint">{{ hint() }}</span>
  `,
  host: {
    '[class.tone-positive]': 'tone() === "positive"',
    '[class.tone-alert]': 'tone() === "alert"',
  },
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 16px 18px;
      border-radius: var(--mat-sys-corner-large);
      border: 1px solid var(--mat-sys-outline-variant);
      background: var(--mat-sys-surface-container-lowest);
    }
    :host.tone-alert {
      border-color: transparent;
      background: var(--mat-sys-error-container);
    }
    .label {
      font: var(--mat-sys-label-large);
      color: var(--mat-sys-on-surface-variant);
    }
    :host.tone-alert .label {
      color: var(--mat-sys-on-error-container);
    }
    .value {
      font: var(--mat-sys-headline-medium);
      font-weight: 700;
      line-height: 1;
      color: var(--mat-sys-on-surface);
    }
    :host.tone-alert .value {
      color: var(--mat-sys-on-error-container);
    }
    .hint {
      font: var(--mat-sys-label-large);
      color: var(--mat-sys-on-surface-variant);
    }
    :host.tone-positive .hint {
      color: var(--mat-sys-primary);
      font-weight: 600;
    }
    :host.tone-alert .hint {
      color: var(--mat-sys-on-error-container);
      font-weight: 600;
    }
  `,
})
export class StatTile {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly hint = input('');
  readonly tone = input<StatTone>('neutral');
}
