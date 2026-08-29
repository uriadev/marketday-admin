import { Injectable, signal } from '@angular/core';

/**
 * Shell state shared between the console layout and the screen inside it —
 * currently just whether the navigation drawer is open. Provided by
 * `ConsoleLayout`, so it lives and dies with the console routes; feature
 * screens inject it to wire their drawer-toggle button.
 */
@Injectable()
export class ConsoleChrome {
  private readonly _drawerOpen = signal(true);
  readonly drawerOpen = this._drawerOpen.asReadonly();

  toggleDrawer(): void {
    this._drawerOpen.update((open) => !open);
  }

  setDrawer(open: boolean): void {
    this._drawerOpen.set(open);
  }
}
