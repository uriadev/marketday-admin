import { Routes } from '@angular/router';
import { SupportStore } from './support-store';
import { SupportThreadFacade } from './support-thread-facade';

/**
 * The support section (`../../../../docs/ARCHITECTURE.md` §7). The thread is a
 * **child** of the inbox rather than a sibling, so opening an enquiry never
 * unmounts the list — the queue keeps its scroll position and its filters while
 * you work down it.
 */
export const SUPPORT_ROUTES: Routes = [
  {
    path: '',
    title: 'Support · MarketDay Admin',
    providers: [SupportStore, SupportThreadFacade],
    loadComponent: () => import('./support/support').then((m) => m.Support),
    children: [
      {
        path: ':enquiryId',
        loadComponent: () => import('./support-thread/support-thread').then((m) => m.SupportThread),
      },
    ],
  },
];
