import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatIconButton } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { AuthStore } from '../../core/auth/auth-store';
import { Avatar } from '../../shared/components/avatar/avatar';
import { BrandMark } from '../../shared/components/brand-mark/brand-mark';
import { ConsoleChrome } from './console-chrome';

interface NavLink {
  icon: string;
  label: string;
  /** Set once the screen exists; without it the link renders disabled. */
  route?: string;
  /** Trailing count or badge text. */
  meta?: string;
  /** true renders the meta as a filled badge, false as a muted count. */
  badge?: boolean;
}

@Component({
  selector: 'md-console-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ConsoleChrome],
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatSidenavModule,
    MatListModule,
    MatIconModule,
    MatIconButton,
    MatDividerModule,
    Avatar,
    BrandMark,
  ],
  templateUrl: './console-layout.html',
  styleUrl: './console-layout.css',
})
export class ConsoleLayout {
  protected readonly chrome = inject(ConsoleChrome);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  protected readonly user = this.auth.user;
  /** The console's IA. A link with a `route` is wired up; the rest are shown
   *  disabled so the shell reads true while the screens land. */
  protected readonly platformLinks: NavLink[] = [
    { icon: 'storefront', label: 'Markets', meta: '7', route: '/markets' },
    { icon: 'shopping_bag', label: 'Vendors', meta: '4', badge: true, route: '/vendors' },
    { icon: 'group', label: 'Users', meta: '318', route: '/users' },
    { icon: 'support_agent', label: 'Support', meta: '9', badge: true, route: '/support' },
  ];

  protected readonly accountLinks: NavLink[] = [
    { icon: 'shield', label: 'Team & roles' },
    { icon: 'tune', label: 'Settings', route: '/account' },
  ];

  protected signOut(): void {
    this.auth.signOut();
    void this.router.navigateByUrl('/login');
  }
}
