import { Routes } from '@angular/router';
import { MarketsStore } from './markets-store';
import { MarketDetailFacade } from './market-detail-facade';
import { MarketScheduleFacade } from './market-schedule-facade';
import { MarketSettingsFacade } from './market-settings-facade';
import { MarketStallsStore } from './market-stalls-store';
import { MarketVendorsStore } from './market-vendors-store';

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
    loadComponent: () => import('./markets/markets').then((m) => m.Markets),
  },
  {
    // Before `:slug`, or "new" is read as a market's slug.
    path: 'new',
    title: 'Add market · MarketDay Admin',
    loadComponent: () => import('./market-wizard/market-wizard').then((m) => m.MarketWizard),
  },
  {
    // Two segments, so it has to come before `:slug` to be matched at all.
    path: ':slug/edit',
    title: 'Continue market setup · MarketDay Admin',
    loadComponent: () => import('./market-wizard/market-wizard').then((m) => m.MarketWizard),
  },
  {
    path: ':slug',
    title: 'Manage market · MarketDay Admin',
    providers: [MarketDetailFacade],
    loadComponent: () => import('./market-detail/market-detail').then((m) => m.MarketDetail),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./market-overview/market-overview').then((m) => m.MarketOverview),
      },
      {
        path: 'stalls',
        providers: [MarketStallsStore],
        loadComponent: () => import('./market-stalls/market-stalls').then((m) => m.MarketStalls),
      },
      {
        path: 'vendors',
        providers: [MarketVendorsStore],
        loadComponent: () => import('./market-vendors/market-vendors').then((m) => m.MarketVendors),
      },
      {
        path: 'schedule',
        providers: [MarketScheduleFacade],
        loadComponent: () =>
          import('./market-schedule/market-schedule').then((m) => m.MarketSchedule),
      },
      {
        path: 'settings',
        providers: [MarketSettingsFacade],
        loadComponent: () =>
          import('./market-settings/market-settings').then((m) => m.MarketSettings),
      },
    ],
  },
];
