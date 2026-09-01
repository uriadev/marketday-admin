import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatAnchor, MatIconAnchor, MatIconButton } from '@angular/material/button';

/** One step of the header's breadcrumb trail. */
export interface Crumb {
  readonly label: string;
  /** Where the step goes. `null` renders the label without a destination. */
  readonly link: string | null;
}

/**
 * The 64px bar at the top of every console screen: a leading button, the screen
 * title, and a slot for screen-specific controls (search, filters, actions).
 *
 * The leading button is the drawer toggle by default (design 1e, 1f). Pass
 * `backLink` and the bar becomes a detail header instead — a back arrow and a
 * breadcrumb trail to the screens above (design 1g). Presentational either way:
 * it emits `menu` and lets the feature decide what that does.
 */
@Component({
  selector: 'md-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatToolbarModule, MatIconModule, MatIconButton, MatIconAnchor, MatAnchor],
  template: `
    <mat-toolbar class="header">
      @if (backLink(); as link) {
        <a matIconButton [routerLink]="link" [attr.aria-label]="'Back to ' + backLabel()">
          <mat-icon>chevron_left</mat-icon>
        </a>
      } @else {
        <button matIconButton type="button" aria-label="Toggle navigation" (click)="menu.emit()">
          <mat-icon>menu</mat-icon>
        </button>
      }

      <div class="titles">
        @if (crumbs().length) {
          <nav class="trail" aria-label="Breadcrumb">
            @for (crumb of crumbs(); track crumb.label) {
              @if (crumb.link; as link) {
                <a matButton class="crumb" [routerLink]="link">{{ crumb.label }}</a>
              } @else {
                <span class="crumb crumb--flat">{{ crumb.label }}</span>
              }
              <span class="separator" aria-hidden="true">/</span>
            }
          </nav>
        }
        <h1 class="heading" [class.heading--compact]="crumbs().length > 0">{{ heading() }}</h1>
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
    .trail {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .crumb {
      color: var(--mat-sys-on-surface-variant);
    }
    .crumb--flat {
      padding-inline: 12px;
      font: var(--mat-sys-label-large);
    }
    .separator {
      color: var(--mat-sys-outline);
    }
    /* Too narrow for a trail: only the step the back arrow returns to stays. */
    @media (width < 600px) {
      .trail > :not(:nth-last-child(-n + 2)) {
        display: none;
      }
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
  /** Route for the back arrow. `null` keeps the drawer toggle. */
  readonly backLink = input<string | null>(null);
  /**
   * What sits before the heading — only meaningful with `backLink`. A bare
   * string is the single parent at `backLink`; a list is the whole trail, each
   * step carrying its own route.
   */
  readonly breadcrumb = input<string | readonly Crumb[] | null>(null);
  readonly menu = output<void>();

  /** The trail, normalized — a lone string is one crumb pointing at `backLink`. */
  protected readonly crumbs = computed<readonly Crumb[]>(() => {
    const breadcrumb = this.breadcrumb();
    if (breadcrumb === null) return [];
    return typeof breadcrumb === 'string'
      ? [{ label: breadcrumb, link: this.backLink() }]
      : breadcrumb;
  });

  /** The arrow goes where the trail ends, so it is announced by that name. */
  protected readonly backLabel = computed(
    () => this.crumbs().at(-1)?.label ?? 'the previous screen',
  );
}
