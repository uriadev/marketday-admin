import { Routes } from '@angular/router';
import { ProfileFacade } from './profile-facade';
import { SecurityFacade } from './security-facade';

/**
 * The settings section (`../../../../docs/ARCHITECTURE.md` §7). Profile is the
 * page design 1k draws; Security holds the passkeys, which no design screen
 * covers yet. The rest of the list is disabled in the shell until there is a
 * screen behind it.
 */
export const ACCOUNT_ROUTES: Routes = [
  {
    path: '',
    title: 'Settings · MarketDay Admin',
    loadComponent: () => import('./account/account').then((m) => m.Account),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'profile' },
      {
        path: 'profile',
        title: 'Profile · MarketDay Admin',
        providers: [ProfileFacade],
        loadComponent: () => import('./profile/profile').then((m) => m.Profile),
      },
      {
        path: 'security',
        title: 'Security · MarketDay Admin',
        providers: [SecurityFacade],
        loadComponent: () => import('./security/security').then((m) => m.Security),
      },
    ],
  },
];
