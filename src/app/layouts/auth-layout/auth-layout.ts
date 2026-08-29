import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * The shell for the signed-out screens (design 1l / 1m): the cream page ground
 * with a single centred panel. Each auth screen supplies its own heading and
 * brand treatment inside the panel.
 */
@Component({
  selector: 'md-auth-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  template: `
    <main class="panel">
      <router-outlet />
    </main>
  `,
  styles: `
    :host {
      display: grid;
      place-items: center;
      min-block-size: 100dvh;
      padding: 24px;
      box-sizing: border-box;
      background: var(--mat-sys-background);
    }
    .panel {
      inline-size: min(100%, 480px);
      padding: 40px;
      box-sizing: border-box;
      background: var(--mat-sys-surface-container-lowest);
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: var(--mat-sys-corner-large);
      box-shadow: var(--mat-sys-level1);
    }
  `,
})
export class AuthLayout {}
