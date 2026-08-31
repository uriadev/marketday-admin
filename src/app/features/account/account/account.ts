import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { ConsoleChrome } from '../../../layouts/console-layout/console-chrome';
import { PageHeader } from '../../../shared/components/page-header/page-header';

interface SettingsLink {
  icon: string;
  label: string;
  /** Set once the page exists; without it the link renders disabled. */
  route?: string;
}

/**
 * The settings section's shell (design 1k): a nav list of settings pages beside
 * the page itself.
 *
 * The design draws this list in place of the console drawer. Here it sits
 * inside the console shell as a second column instead, so the drawer keeps
 * meaning the same thing on every screen and `/account` stays a routed child
 * like every other section (`../../../../docs/ARCHITECTURE.md` §7).
 */
@Component({
  selector: 'md-account',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatIconModule, MatListModule, PageHeader],
  templateUrl: './account.html',
  styleUrl: './account.css',
})
export class Account {
  protected readonly chrome = inject(ConsoleChrome);

  protected readonly links: SettingsLink[] = [
    { icon: 'person', label: 'Profile', route: 'profile' },
    { icon: 'lock', label: 'Security' },
    { icon: 'notifications', label: 'Notifications' },
    { icon: 'group', label: 'Team members' },
    { icon: 'credit_card', label: 'Billing' },
  ];
}
