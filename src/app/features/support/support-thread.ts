import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Avatar } from '../../shared/components/avatar/avatar';
import { StatusPill } from '../../shared/components/status-pill/status-pill';
import { SUPPORT_AGENTS } from '../../core/api/in-memory/in-memory-support-repository';
import { SupportThreadFacade } from './support-thread-facade';

/** What the composer is writing — a reply the person sees, or a private note. */
type ComposerMode = 'reply' | 'note';

/** Canned openings, so a common answer is not retyped every time. */
const SAVED_REPLIES: readonly { label: string; body: string }[] = [
  {
    label: 'Looking into it',
    body: 'Thanks for getting in touch — I am looking into this now and will come back to you today.',
  },
  {
    label: 'Capped by market hours',
    body: 'Stall hours are capped by the market’s own trading window, so they cannot run past it. I have asked the organiser whether the market can be extended.',
  },
  {
    label: 'Refund on the way',
    body: 'Sorry about that. I have put the refund through — it should be back on your card within three working days.',
  },
];

/**
 * One enquiry, open beside the queue (design 1j). A child route of the inbox,
 * so the list it came from stays mounted.
 *
 * Reading is the whole message history — what came in, what the team replied,
 * and the internal notes only the team sees. Writing is one box with two modes,
 * because a note and a reply differ in who reads them, not in how they are
 * written.
 */
@Component({
  selector: 'md-support-thread',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Avatar,
    StatusPill,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatProgressBarModule,
  ],
  templateUrl: './support-thread.html',
  styleUrl: './support-thread.css',
})
export class SupportThread {
  /** Bound from the `:enquiryId` route param by `withComponentInputBinding()`. */
  readonly enquiryId = input.required<string>();

  protected readonly facade = inject(SupportThreadFacade);
  protected readonly thread = this.facade.thread;
  protected readonly agents = SUPPORT_AGENTS;
  protected readonly savedReplies = SAVED_REPLIES;

  protected readonly mode = signal<ComposerMode>('reply');
  protected readonly draft = signal('');

  protected readonly placeholder = computed(() =>
    this.mode() === 'note'
      ? 'Write a note for the team…'
      : `Write a reply to ${this.thread()?.replyTo ?? 'them'}…`,
  );

  /** The line under the composer changes with who will read what is written. */
  protected readonly sendHint = computed(() =>
    this.mode() === 'note'
      ? 'Only the support team sees this'
      : 'Sends by email and in-app notification',
  );

  protected readonly canSend = computed(
    () => this.draft().trim().length > 0 && !this.facade.sending(),
  );

  constructor() {
    effect(() => {
      this.facade.load(this.enquiryId());
      // A fresh enquiry starts with an empty box, in reply mode.
      this.draft.set('');
      this.mode.set('reply');
    });
  }

  protected onDraft(event: Event): void {
    this.draft.set((event.target as HTMLTextAreaElement).value);
  }

  protected insertSavedReply(body: string): void {
    this.draft.update((current) => (current.trim() ? `${current.trim()}\n\n${body}` : body));
  }

  protected send(): void {
    if (!this.canSend()) return;
    this.facade.reply(this.draft().trim(), this.mode() === 'note');
    this.draft.set('');
  }
}
