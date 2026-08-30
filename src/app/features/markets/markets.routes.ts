import { Routes } from '@angular/router';
import { MarketsStore } from './markets-store';
import { MarketDetailFacade } from './market-detail-facade';

/**
 * The markets section (`../../../../docs/ARCHITECTURE.md` §7). Each screen's
 * state is provided at its own route so it is created and torn down with it —
 * the detail facade sits on `:slug` so every tab under it shares one load.
 */
export const MARKETS_ROUTES: Routes = [
  {
    path: '',
    title: 'Markets · MarketDay Admin',
    providers: [MarketsStore],
    loadComponent: () => import('./markets').then((m) => m.Markets),
  },
  {
    // Before `:slug`, or "new" is read as a market's slug.
    path: 'new',
    title: 'Add market · MarketDay Admin',
    loadComponent: () => import('./market-wizard').then((m) => m.MarketWizard),
  },
  {
    path: ':slug',
    title: 'Manage market · MarketDay Admin',
    providers: [MarketDetailFacade],
    loadComponent: () => import('./market-detail').then((m) => m.MarketDetail),
    children: [
      {
        path: '',
        loadComponent: () => import('./market-overview').then((m) => m.MarketOverview),
      },
    ],
  },
];
