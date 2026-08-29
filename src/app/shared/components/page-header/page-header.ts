import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatIconButton } from '@angular/material/button';

/**
 * The 64px bar at the top of every console screen: a drawer toggle, the screen
 * title, and a slot for screen-specific controls (search, filters, actions).
 * Presentational — it emits `menu` and lets the feature decide what that does.
 */
@Component({
  selector: 'md-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatToolbarModule, MatIconModule, MatIconButton],
  template: `
    <mat-toolbar class="header">
      <button
        matIconButton
        type="button"
        [attr.aria-label]="'Toggle navigation'"
        (click)="menu.emit()"
      >
        <mat-icon>menu</mat-icon>
      </button>
      <h1 class="heading">{{ heading() }}</h1>
      <span class="spacer"></span>
      <div class="actions">
        <ng-content />
      </div>
    </mat-toolbar>
  `,
  styles: `
    .header {
      block-size: 64px;
      padding-inline: 4px 16px;
      gap: 4px;
      background: var(--mat-sys-surface-container-lowest);
      border-block-end: 1px solid var(--mat-sys-outline-variant);
    }
    .heading {
      margin: 0;
      padding-inline-start: 8px;
      font: var(--mat-sys-headline-small);
      font-weight: 500;
      color: var(--mat-sys-on-surface);
    }
    .spacer {
      flex: 1 1 auto;
    }
    .actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
  `,
})
export class PageHeader {
  readonly heading = input.required<string>();
  readonly menu = output<void>();
}
