import { Routes } from '@angular/router';
import { PromotionsStore } from './promotions-store';

/**
 * The promotions section — the list, and one full-page form for a new
 * promotion and an existing one. `new` takes `?eventId=`, `?marketId=` or
 * `?vendorId=` to pre-pick the subject ("Promote this event").
 */
export const PROMOTIONS_ROUTES: Routes = [
  {
    path: '',
    title: 'Promotions · MarketDay Admin',
    providers: [PromotionsStore],
    loadComponent: () => import('./promotions/promotions').then((m) => m.Promotions),
  },
  {
    path: 'new',
    title: 'New promotion · MarketDay Admin',
    loadComponent: () =>
      import('./promotion-form/promotion-form').then((m) => m.PromotionForm),
  },
  {
    path: ':id',
    title: 'Promotion · MarketDay Admin',
    loadComponent: () =>
      import('./promotion-form/promotion-form').then((m) => m.PromotionForm),
  },
];
