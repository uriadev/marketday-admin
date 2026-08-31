import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ConsoleChrome } from '../../../layouts/console-layout/console-chrome';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusPill } from '../../../shared/components/status-pill/status-pill';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import {
  ENQUIRY_SOURCES,
  EnquirySource,
  EnquiryStatus,
  EnquirySummary,
  SupportFilters,
  isOverdue,
} from '../../../core/models/support.model';
import { SUPPORT_AGENTS } from '../../../core/api/in-memory/in-memory-support-repository';
import { UNASSIGNED, SupportStore } from '../support-store';

const STATUS_LABELS: Record<SupportFilters['status'], string> = {
  open: 'Open',
  resolved: 'Resolved',
  all: 'All',
};

const SOURCE_LABELS: Record<EnquirySource, string> = {
  'vendor-help': 'Vendor help',
  'contact-form': 'Contact form',
  email: 'Email',
};

/**
 * The support inbox (design 1j): one queue on the left, the open thread on the
 * right. The thread is a child route (`/support/:enquiryId`), so opening one
 * never unmounts the list — which is what keeps scroll position and the
 * filters as you work through the queue.
 */
@Component({
  selector: 'md-support',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    PageHeader,
    StatusPill,
    EmptyState,
    MatButtonModule,
    MatChipsModule,
    MatIconModule,
    MatMenuModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
  ],
  templateUrl: './support.html',
  styleUrl: './support.css',
})
export class Support implements OnInit {
  protected readonly store = inject(SupportStore);
  protected readonly chrome = inject(ConsoleChrome);
  private readonly router = inject(Router);

  /** Filters arrive as query params (§7); an absent one binds as `undefined`. */
  readonly q = input<string>();
  readonly source = input<EnquirySource>();
  readonly status = input<EnquiryStatus | 'all'>();
  readonly assignee = input<string>();

  protected readonly sources = ENQUIRY_SOURCES;
  protected readonly agents = SUPPORT_AGENTS;
  protected readonly unassigned = UNASSIGNED;

  protected readonly filters = computed<SupportFilters>(() => ({
    q: this.q() ?? '',
    source: this.source() ?? null,
    status: this.status() ?? 'open',
    assignee: this.assignee() ?? null,
  }));

  protected readonly statusLabel = computed(() => STATUS_LABELS[this.filters().status]);

  protected readonly assigneeLabel = computed(() => {
    const assignee = this.filters().assignee;
    if (assignee === null) return 'Assignee: anyone';
    return assignee === UNASSIGNED ? 'Assignee: unassigned' : `Assignee: ${assignee}`;
  });

  /** "Inbox · 9 open" — the count is of the whole queue, not the filtered view. */
  protected readonly inboxLabel = computed(() => `Inbox · ${this.store.openCount()} open`);

  constructor() {
    // The URL is the source of truth; the store follows it.
    effect(() => this.store.setFilters(this.filters()));

    // An inbox that opens on nothing wastes the first click, so the newest
    // enquiry is selected once the queue arrives — replacing the URL rather
    // than pushing, so Back still leaves the inbox.
    effect(() => {
      const first = this.store.visible()[0];
      if (!first) return;
      untracked(() => {
        if (this.router.url.includes('/support/')) return;
        void this.router.navigate(['/support', first.id], {
          queryParamsHandling: 'preserve',
          replaceUrl: true,
        });
      });
    });
  }

  ngOnInit(): void {
    this.store.load();
  }

  protected setParam(patch: Record<string, string | null>): void {
    void this.router.navigate([], {
      queryParams: patch,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected clearFilters(): void {
    this.setParam({ q: null, source: null, status: null, assignee: null });
  }

  protected onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.setParam({ q: value === '' ? null : value });
  }

  protected sourceLabel(source: EnquirySource): string {
    return SOURCE_LABELS[source];
  }

  protected isOverdue(enquiry: EnquirySummary): boolean {
    return isOverdue(enquiry);
  }
}
