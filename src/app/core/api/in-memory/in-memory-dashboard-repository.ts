import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { delay } from 'rxjs/operators';
import { OverviewSnapshot } from '../../models/overview.model';
import { DashboardRepository } from '../ports/dashboard-repository';

/** Sample data lifted straight from the design (artboard 1e). Exported so tests
 *  can assert against the same fixture the screen renders. */
export const OVERVIEW_FIXTURE: OverviewSnapshot = {
  today: 'Saturday 14 June',
  summary: '3 markets trading today · 4 vendor applications · 9 open enquiries',
  stats: [
    { label: 'Active markets', value: '7', hint: '+1 this month', tone: 'positive' },
    { label: 'Approved vendors', value: '62', hint: '+5 this month', tone: 'positive' },
    { label: 'Shoppers', value: '318', hint: '42 active this week', tone: 'neutral' },
    { label: 'Open enquiries', value: '9', hint: '2 over 48h', tone: 'alert' },
  ],
  preorders: [
    { label: '17 May', value: 42, emphasis: false },
    { label: '24 May', value: 56, emphasis: false },
    { label: '31 May', value: 48, emphasis: false },
    { label: '7 Jun', value: 70, emphasis: false },
    { label: '14 Jun', value: 64, emphasis: false },
    { label: '21 Jun', value: 82, emphasis: true },
    { label: '28 Jun', value: 76, emphasis: true },
    { label: '5 Jul', value: 94, emphasis: true },
  ],
  marketsToday: [
    {
      name: 'Temple Bar Food Market',
      hours: '09:00–14:30',
      vendors: '18 of 20',
      status: 'trading',
      statusLabel: 'Trading',
    },
    {
      name: 'Marlay Park Market',
      hours: '10:00–16:00',
      vendors: '11 of 16',
      status: 'trading',
      statusLabel: 'Trading',
    },
    {
      name: 'Howth Harbour Market',
      hours: '09:00–17:00',
      vendors: '6 of 12',
      status: 'upcoming',
      statusLabel: 'Opens 09:00',
    },
  ],
  pendingVendors: [
    { id: 'coolea-cheese-co', name: 'Coolea Cheese Co.', meta: 'Temple Bar · applied 2 days ago' },
    {
      id: 'blackwater-bakehouse',
      name: 'Blackwater Bakehouse',
      meta: 'Marlay Park · applied 3 days ago',
    },
    {
      id: 'sliabh-luachra-honey',
      name: 'Sliabh Luachra Honey',
      meta: 'Howth · applied 5 days ago',
    },
  ],
  latestEnquiries: [
    {
      id: 'enq-stall-hours',
      title: "Can't edit stall opening hours",
      meta: 'Vendor help · McNally Family Farm · 3h',
      urgency: 'urgent',
    },
    {
      id: 'enq-refund',
      title: 'Refund for a collected order',
      meta: 'Contact form · shopper · 6h',
      urgency: 'urgent',
    },
    {
      id: 'enq-add-market',
      title: 'Add our market to the app',
      meta: 'Email · organiser · 1d',
      urgency: 'normal',
    },
  ],
};

@Injectable()
export class InMemoryDashboardRepository extends DashboardRepository {
  override overview(): Observable<OverviewSnapshot> {
    return of(OVERVIEW_FIXTURE).pipe(delay(400));
  }
}
