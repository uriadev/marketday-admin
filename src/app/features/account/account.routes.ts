import { Routes } from '@angular/router';
import { ProfileFacade } from './profile-facade';

/**
 * The settings section (`../../../../docs/ARCHITECTURE.md` §7). Profile is the
 * page design 1k draws; the rest of the list is disabled in the shell until
 * there is a screen behind it.
 */
export const ACCOUNT_ROUTES: Routes = [
  {
    path: '',
    title: 'Settings · MarketDay Admin',
    loadComponent: () => import('./account').then((m) => m.Account),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'profile' },
      {
        path: 'profile',
        title: 'Profile · MarketDay Admin',
        providers: [ProfileFacade],
        loadComponent: () => import('./profile').then((m) => m.Profile),
      },
    ],
  },
];
