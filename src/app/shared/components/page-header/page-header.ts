import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatAnchor, MatIconAnchor, MatIconButton } from '@angular/material/button';

/**
 * The 64px bar at the top of every console screen: a leading button, the screen
 * title, and a slot for screen-specific controls (search, filters, actions).
 *
 * The leading button is the drawer toggle by default (design 1e, 1f). Pass
 * `backLink` and the bar becomes a detail header instead — a back arrow and a
 * breadcrumb to the parent list (design 1g). Presentational either way: it
 * emits `menu` and lets the feature decide what that does.
 */
@Component({
  selector: 'md-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatToolbarModule, MatIconModule, MatIconButton, MatIconAnchor, MatAnchor],
  template: `
    <mat-toolbar class="header">
      @if (backLink(); as link) {
        <a
          matIconButton
          [routerLink]="link"
          [attr.aria-label]="'Back to ' + (breadcrumb() ?? 'the previous screen')"
        >
          <mat-icon>chevron_left</mat-icon>
        </a>
      } @else {
        <button matIconButton type="button" aria-label="Toggle navigation" (click)="menu.emit()">
          <mat-icon>menu</mat-icon>
        </button>
      }

      <div class="titles">
        @if (breadcrumb(); as crumb) {
          <a matButton class="crumb" [routerLink]="backLink()">{{ crumb }}</a>
          <span class="separator" aria-hidden="true">/</span>
        }
        <h1 class="heading" [class.heading--compact]="breadcrumb() !== null">{{ heading() }}</h1>
      </div>

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
    .titles {
      display: flex;
      align-items: center;
      gap: 4px;
      min-inline-size: 0;
    }
    .crumb {
      color: var(--mat-sys-on-surface-variant);
    }
    .separator {
      color: var(--mat-sys-outline);
    }
    .heading {
      margin: 0;
      padding-inline-start: 8px;
      font: var(--mat-sys-headline-small);
      font-weight: 500;
      color: var(--mat-sys-on-surface);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    /* Beside a breadcrumb the title is one step down the scale, per design 1g. */
    .heading--compact {
      padding-inline-start: 4px;
      font: var(--mat-sys-title-large);
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
  /** Route for the back arrow and the breadcrumb. `null` keeps the drawer toggle. */
  readonly backLink = input<string | null>(null);
  /** Parent label shown before the heading — only meaningful with `backLink`. */
  readonly breadcrumb = input<string | null>(null);
  readonly menu = output<void>();
}
