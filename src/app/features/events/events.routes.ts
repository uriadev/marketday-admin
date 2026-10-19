import { Routes } from '@angular/router';
import { EventsStore } from './events-store';

/**
 * The events section — the list, and one full-page form for both a new event
 * and an existing one. `new` comes before `:id`, or it is read as an id.
 */
export const EVENTS_ROUTES: Routes = [
  {
    path: '',
    title: 'Events · MarketDay Admin',
    providers: [EventsStore],
    loadComponent: () => import('./events/events').then((m) => m.Events),
  },
  {
    path: 'new',
    title: 'New event · MarketDay Admin',
    loadComponent: () => import('./event-form/event-form').then((m) => m.EventForm),
  },
  {
    path: ':id',
    title: 'Event · MarketDay Admin',
    loadComponent: () => import('./event-form/event-form').then((m) => m.EventForm),
  },
];
