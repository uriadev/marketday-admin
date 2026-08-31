import { Routes } from '@angular/router';
import { AccountsStore } from './accounts-store';

/**
 * One screen, but its own routes file like every other feature — that is what
 * keeps `AccountsStore` inside the lazy chunk rather than pulling it into the
 * main bundle through `app.routes.ts`.
 */
export const USERS_ROUTES: Routes = [
  {
    path: '',
    title: 'Users · MarketDay Admin',
    providers: [AccountsStore],
    loadComponent: () => import('./users/users').then((m) => m.Users),
  },
];
