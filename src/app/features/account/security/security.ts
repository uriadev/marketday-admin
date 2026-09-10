import { formatDate } from '@angular/common';
import { ChangeDetectionStrategy, Component, LOCALE_ID, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { WebAuthn } from '../../../core/auth/webauthn';
import { Passkey } from '../../../core/models/passkey.model';
import { Notifications } from '../../../core/notifications/notifications';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import { StatusPill } from '../../../shared/components/status-pill/status-pill';
import {
  PasskeyNameDialog,
  PasskeyNameDialogData,
} from '../passkey-name-dialog/passkey-name-dialog';
import {
  RemovePasskeyDialog,
  RemovePasskeyDialogData,
} from '../remove-passkey-dialog/remove-passkey-dialog';
import { SecurityFacade } from '../security-facade';

/**
 * Settings → Security: the signed-in admin's passkeys. There is no design
 * screen for this page; it follows Profile's layout (design 1k) — one column,
 * read top to bottom — with Material's list for the passkeys themselves.
 *
 * Passkeys sit beside the password rather than replacing it: the password
 * keeps working, and is how someone gets back in without their device.
 */
@Component({
  selector: 'md-security',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    EmptyState,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatMenuModule,
    MatProgressBarModule,
    StatusPill,
  ],
  templateUrl: './security.html',
  styleUrl: './security.css',
})
export class Security {
  protected readonly facade = inject(SecurityFacade);
  private readonly dialog = inject(MatDialog);
  private readonly notifications = inject(Notifications);
  private readonly locale = inject(LOCALE_ID);

  /**
   * Read once, in the browser: the console is client-rendered
   * (`app.routes.server.ts`), so there is no server pass to disagree with.
   */
  protected readonly supported = inject(WebAuthn).isSupported();

  constructor() {
    this.facade.load();
  }

  /**
   * "Added 1 Sep 2026 · Last used 9 Sep 2026". Built here rather than in the
   * template, where the line breaks Prettier adds would lead with a space that
   * Material's list line renders.
   */
  protected history(passkey: Passkey): string {
    const day = (iso: string) => formatDate(iso, 'd MMM y', this.locale);
    const used = passkey.lastUsedAt ? `Last used ${day(passkey.lastUsedAt)}` : 'Not used yet';
    return `Added ${day(passkey.createdAt)} · ${used}`;
  }

  protected add(): void {
    this.facade.add(
      (passkey) =>
        this.askForName(passkey, {
          heading: 'Passkey added',
          body: 'Name it after the device or password manager it lives in, so you can tell your passkeys apart.',
          name: passkey.name,
          dismissLabel: 'Skip',
        }),
      (message) => this.notifications.error(message),
    );
  }

  protected rename(passkey: Passkey): void {
    this.askForName(passkey, {
      heading: 'Rename passkey',
      name: passkey.name,
      dismissLabel: 'Cancel',
    });
  }

  protected remove(passkey: Passkey): void {
    this.dialog
      .open<RemovePasskeyDialog, RemovePasskeyDialogData, boolean>(RemovePasskeyDialog, {
        data: { name: passkey.name },
      })
      .afterClosed()
      .subscribe((confirmed) => {
        if (!confirmed) return;
        this.facade.remove(
          passkey.id,
          () => this.notifications.success(`“${passkey.name}” no longer signs you in.`),
          (message) => this.notifications.error(message),
        );
      });
  }

  private askForName(passkey: Passkey, data: PasskeyNameDialogData): void {
    this.dialog
      .open<PasskeyNameDialog, PasskeyNameDialogData, string>(PasskeyNameDialog, { data })
      .afterClosed()
      .subscribe((name) => {
        if (!name || name === passkey.name) return;
        this.facade.rename(passkey.id, name, (message) => this.notifications.error(message));
      });
  }
}
