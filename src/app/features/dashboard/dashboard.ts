import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ConsoleChrome } from '../../layouts/console-layout/console-chrome';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { StatTile } from '../../shared/components/stat-tile/stat-tile';
import { StatusPill } from '../../shared/components/status-pill/status-pill';
import { Avatar } from '../../shared/components/avatar/avatar';
import { DashboardFacade } from './dashboard-facade';

const RANGES = ['Last 7 days', 'Last 30 days', 'Last 90 days'] as const;
type Range = (typeof RANGES)[number];

@Component({
  selector: 'md-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DashboardFacade],
  imports: [
    PageHeader,
    StatTile,
    StatusPill,
    Avatar,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
    MatTooltipModule,
    MatProgressBarModule,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit {
  protected readonly facade = inject(DashboardFacade);
  protected readonly chrome = inject(ConsoleChrome);

  protected readonly snapshot = this.facade.snapshot;
  protected readonly ranges = RANGES;
  protected readonly range = signal<Range>('Last 30 days');

  protected readonly marketColumns = ['name', 'hours', 'vendors', 'status'];
  protected readonly marketsToday = computed(() => this.snapshot()?.marketsToday ?? []);

  ngOnInit(): void {
    this.facade.load();
  }
}
