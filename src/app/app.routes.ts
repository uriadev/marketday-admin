import { Routes } from '@angular/router';
import { authGuard, codeChallengeGuard, guestGuard } from './core/auth/auth-guards';

/**
 * Two `path: ''` shells. The console block MUST stay first — otherwise a bare
 * `/` matches the auth shell and renders an empty panel.
 */
export const routes: Routes = [
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./layouts/console-layout/console-layout').then((m) => m.ConsoleLayout),
    children: [
      {
        path: '',
        title: 'Overview · MarketDay Admin',
        loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'markets',
        loadChildren: () =>
          import('./features/markets/markets.routes').then((m) => m.MARKETS_ROUTES),
      },
      {
        path: 'vendors',
        loadChildren: () =>
          import('./features/vendors/vendors.routes').then((m) => m.VENDORS_ROUTES),
      },
      {
        path: 'users',
        loadChildren: () => import('./features/users/users.routes').then((m) => m.USERS_ROUTES),
      },
      {
        path: 'account',
        loadChildren: () =>
          import('./features/account/account.routes').then((m) => m.ACCOUNT_ROUTES),
      },
      {
        path: 'support',
        loadChildren: () =>
          import('./features/support/support.routes').then((m) => m.SUPPORT_ROUTES),
      },
    ],
  },
  {
    path: '',
    canActivateChild: [guestGuard],
    loadComponent: () => import('./layouts/auth-layout/auth-layout').then((m) => m.AuthLayout),
    children: [
      {
        path: 'login',
        title: 'Sign in · MarketDay Admin',
        loadComponent: () => import('./features/auth/login').then((m) => m.Login),
      },
      {
        path: 'login/verify',
        title: 'Verify · MarketDay Admin',
        canActivate: [codeChallengeGuard],
        loadComponent: () => import('./features/auth/verify').then((m) => m.Verify),
      },
      {
        path: 'forgot-password',
        title: 'Reset password · MarketDay Admin',
        loadComponent: () =>
          import('./features/auth/forgot-password').then((m) => m.ForgotPassword),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
