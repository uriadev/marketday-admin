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
