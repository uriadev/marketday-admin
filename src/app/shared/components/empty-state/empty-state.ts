import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/**
 * What a list shows when it has nothing to show — an icon, a headline, a line
 * of guidance, and a slot for the action that gets the user out of it.
 * Presentational; the feature decides what "nothing" means.
 */
@Component({
  selector: 'md-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <mat-icon class="icon">{{ icon() }}</mat-icon>
    <p class="headline">{{ headline() }}</p>
    <p class="body">{{ body() }}</p>
    <ng-content />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 48px 24px;
      border-radius: var(--mat-sys-corner-large);
      border: 1px dashed var(--mat-sys-outline-variant);
      text-align: center;
    }
    .icon {
      inline-size: 32px;
      block-size: 32px;
      font-size: 32px;
      color: var(--mat-sys-outline);
    }
    .headline {
      margin: 0;
      font: var(--mat-sys-title-medium);
      font-weight: 700;
      color: var(--mat-sys-on-surface);
    }
    .body {
      margin: 0;
      max-inline-size: 42ch;
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class EmptyState {
  readonly icon = input('search_off');
  readonly headline = input.required<string>();
  readonly body = input('');
}
