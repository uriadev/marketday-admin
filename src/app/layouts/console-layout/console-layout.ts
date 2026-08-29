import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatIconButton } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { AuthStore } from '../../core/auth/auth-store';
import { BrandMark } from '../../shared/components/brand-mark/brand-mark';
import { ConsoleChrome } from './console-chrome';

interface NavLink {
  icon: string;
  label: string;
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
  protected readonly initials = computed(() => {
    const name = this.user()?.name ?? 'MarketDay';
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] ?? '')
      .join('')
      .toUpperCase();
  });

  /** The rest of the console's IA. Wired up screen by screen; shown now so the
   *  shell reads true. */
  protected readonly platformLinks: NavLink[] = [
    { icon: 'storefront', label: 'Markets', meta: '7' },
    { icon: 'shopping_bag', label: 'Vendors', meta: '4', badge: true },
    { icon: 'group', label: 'Users', meta: '318' },
    { icon: 'support_agent', label: 'Support', meta: '9', badge: true },
  ];

  protected readonly accountLinks: NavLink[] = [
    { icon: 'shield', label: 'Team & roles' },
    { icon: 'tune', label: 'Settings' },
  ];

  protected signOut(): void {
    this.auth.signOut();
    void this.router.navigateByUrl('/login');
  }
}
