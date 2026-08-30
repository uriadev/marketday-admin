import { Routes } from '@angular/router';
import { VendorsStore } from './vendors-store';
import { VendorDetailFacade } from './vendor-detail-facade';
import { VendorProductsStore } from './vendor-products-store';
import { VendorProfileFacade } from './vendor-profile-facade';
import { VendorPaymentsStore } from './vendor-payments-store';
import { VendorActivityStore } from './vendor-activity-store';

/**
 * The vendors section (`../../../../docs/ARCHITECTURE.md` §7). The vendor's tabs
 * are real path segments — `/vendors/mcnally-family-farm/markets`, as the design
 * specifies — so the facade sits on `:slug` and every tab under it shares one
 * load.
 */
export const VENDORS_ROUTES: Routes = [
  {
    path: '',
    title: 'Vendors · MarketDay Admin',
    providers: [VendorsStore],
    loadComponent: () => import('./vendors').then((m) => m.Vendors),
  },
  {
    // Before `:slug`, or "invite" is read as a vendor's slug.
    path: 'invite',
    title: 'Invite vendor · MarketDay Admin',
    loadComponent: () => import('./vendor-invite').then((m) => m.VendorInvite),
  },
  {
    path: ':slug',
    title: 'Vendor · MarketDay Admin',
    providers: [VendorDetailFacade],
    loadComponent: () => import('./vendor-detail').then((m) => m.VendorDetail),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'markets' },
      {
        path: 'profile',
        providers: [VendorProfileFacade],
        loadComponent: () => import('./vendor-profile').then((m) => m.VendorProfile),
      },
      {
        path: 'markets',
        loadComponent: () => import('./vendor-markets').then((m) => m.VendorMarkets),
      },
      {
        path: 'staff',
        loadComponent: () => import('./vendor-staff').then((m) => m.VendorStaff),
      },
      {
        path: 'products',
        providers: [VendorProductsStore],
        loadComponent: () => import('./vendor-products').then((m) => m.VendorProducts),
      },
      {
        path: 'payments',
        providers: [VendorPaymentsStore],
        loadComponent: () => import('./vendor-payments').then((m) => m.VendorPayments),
      },
      {
        path: 'activity',
        providers: [VendorActivityStore],
        loadComponent: () => import('./vendor-activity').then((m) => m.VendorActivity),
      },
    ],
  },
];
