import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FormControlName } from '@angular/forms';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { ACCOUNTS_FIXTURE } from '../../../core/api/in-memory/in-memory-account-repository';
import { AdminEmail, EmailRecipient, EmailSenderOption } from '../../../core/models/account.model';
import { ComposedEmail, SendEmailDialog, SendEmailDialogData } from './send-email-dialog';

const ACCOUNT = ACCOUNTS_FIXTURE.find((account) => account.status === 'active')!;
const TO: EmailRecipient = { email: ACCOUNT.email, name: ACCOUNT.name };

const SENDERS: EmailSenderOption[] = [
  { sender: 'SUPPORT', from: 'MarketDay <support@marketday.ie>' },
  { sender: 'HELLO', from: 'MarketDay <hello@marketday.ie>' },
  { sender: 'VENDORS', from: 'MarketDay <vendors@marketday.ie>' },
];

const closed: (ComposedEmail | undefined)[] = [];
const ref = { close: (composed?: ComposedEmail) => closed.push(composed) };
const preview = vi.fn((_to: EmailRecipient, email: AdminEmail) =>
  of({ subject: email.subject, html: `<h1>${email.heading}</h1>` }),
);

function dialogData(overrides: Partial<SendEmailDialogData> = {}): SendEmailDialogData {
  return { to: TO, from: 'SUPPORT', senders: of(SENDERS), preview, ...overrides };
}

function host(fixture: { nativeElement: unknown }): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function open() {
  const fixture = TestBed.createComponent(SendEmailDialog);
  fixture.detectChanges();
  return fixture;
}

function type(fixture: ReturnType<typeof open>, name: string, value: string) {
  const field = host(fixture).querySelector(`[formControlName="${name}"]`) as
    HTMLInputElement | HTMLTextAreaElement;
  field.value = value;
  field.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

/** The message is a rich-text editor, not an input: set through its control. */
function write(fixture: ReturnType<typeof open>, html: string) {
  const control = fixture.debugElement
    .queryAll(By.directive(FormControlName))
    .map((element) => element.injector.get(FormControlName))
    .find((directive) => directive.name === 'bodyHtml')!;
  control.control.setValue(html);
  control.control.markAsTouched();
  fixture.detectChanges();
}

function fillRequired(fixture: ReturnType<typeof open>) {
  type(fixture, 'subject', 'About Saturday');
  type(fixture, 'heading', 'The market moves indoors');
  write(fixture, '<p>First paragraph.</p><p>Second paragraph.</p>');
}

function sendButton(fixture: ReturnType<typeof open>): HTMLButtonElement {
  return Array.from(host(fixture).querySelectorAll('button')).find(
    (button) => button.textContent?.trim() === 'Send email',
  ) as HTMLButtonElement;
}

describe('SendEmailDialog', () => {
  beforeEach(async () => {
    closed.length = 0;
    preview.mockClear();
    await TestBed.configureTestingModule({
      imports: [SendEmailDialog],
      providers: [
        provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: dialogData() },
        { provide: MatDialogRef, useValue: ref },
      ],
    }).compileComponents();
  });

  afterEach(() => vi.useRealTimers());

  it('names who it goes to and from, with the template eyebrow filled in', () => {
    const fixture = open();
    const text = host(fixture).textContent ?? '';

    expect(text).toContain(`Email ${ACCOUNT.name}`);
    expect(text).toContain(ACCOUNT.email);
    expect(text).toContain('From MarketDay <support@marketday.ie>');
    expect(host(fixture).querySelector('[formControlName="toEmail"]')).toBeNull();
    const eyebrow = host(fixture).querySelector('[formControlName="eyebrow"]') as HTMLInputElement;
    expect(eyebrow.value).toBe('From the MarketDay team');
  });

  it('will not send an empty message', () => {
    const fixture = open();
    sendButton(fixture).click();
    fixture.detectChanges();

    expect(closed).toEqual([]);
    expect(host(fixture).textContent).toContain('Write the message');
  });

  it('closes with the trimmed message and no button', () => {
    const fixture = open();
    fillRequired(fixture);
    sendButton(fixture).click();

    expect(closed).toEqual([
      {
        to: TO,
        email: {
          from: 'SUPPORT',
          subject: 'About Saturday',
          eyebrow: 'From the MarketDay team',
          heading: 'The market moves indoors',
          bodyHtml: '<p>First paragraph.</p><p>Second paragraph.</p>',
          cta: null,
          signature: false,
        },
      },
    ]);
  });

  it('sends without a heading, as none rather than an empty one', () => {
    const fixture = open();
    type(fixture, 'subject', 'About Saturday');
    write(fixture, '<p>See you there.</p>');
    sendButton(fixture).click();

    expect(closed[0]?.email.heading).toBeNull();
  });

  it('adds the founder’s sign-off when the toggle is on', () => {
    const fixture = open();
    fillRequired(fixture);
    (host(fixture).querySelector('mat-slide-toggle button[role="switch"]') as HTMLElement).click();
    fixture.detectChanges();
    sendButton(fixture).click();

    expect(closed[0]?.email.signature).toBe(true);
  });

  it('refuses half a button', () => {
    const fixture = open();
    fillRequired(fixture);
    type(fixture, 'ctaLabel', 'See the market');
    sendButton(fixture).click();
    fixture.detectChanges();

    expect(closed).toEqual([]);
    expect(host(fixture).textContent).toContain('A button needs both a label and a link.');
  });

  it('sends a whole button, https only', () => {
    const fixture = open();
    fillRequired(fixture);
    type(fixture, 'ctaLabel', 'See the market');
    type(fixture, 'ctaUrl', 'http://marketday.ie');
    sendButton(fixture).click();
    expect(closed).toEqual([]);

    type(fixture, 'ctaUrl', 'https://marketday.ie/m/1');
    sendButton(fixture).click();
    expect(closed[0]?.email.cta).toEqual({
      label: 'See the market',
      url: 'https://marketday.ie/m/1',
    });
  });

  it('asks the backend for a preview once the form is valid and typing stops', () => {
    vi.useFakeTimers();
    const fixture = open();
    vi.advanceTimersByTime(500);
    fixture.detectChanges();
    expect(preview).not.toHaveBeenCalled();

    fillRequired(fixture);
    vi.advanceTimersByTime(500);
    fixture.detectChanges();

    expect(preview).toHaveBeenCalledTimes(1);
    expect(preview.mock.calls[0]![1].heading).toBe('The market moves indoors');
    expect(host(fixture).querySelector('iframe[title="Email preview"]')).not.toBeNull();
  });

  describe('to someone with no account', () => {
    beforeEach(() => {
      TestBed.overrideProvider(MAT_DIALOG_DATA, {
        useValue: dialogData({ to: null, from: 'VENDORS' }),
      });
    });

    it('asks who it is for, starting from the chosen mailbox', () => {
      const fixture = open();
      const text = host(fixture).textContent ?? '';

      expect(text).toContain('Email someone new');
      expect(text).toContain('From MarketDay <vendors@marketday.ie>');
      expect(host(fixture).querySelector('[formControlName="toEmail"]')).not.toBeNull();
    });

    it('will not send without an address and a name', () => {
      const fixture = open();
      fillRequired(fixture);
      type(fixture, 'toEmail', 'not an address');
      sendButton(fixture).click();
      fixture.detectChanges();

      expect(closed).toEqual([]);
      expect(host(fixture).textContent).toContain('Enter an email address');
      expect(host(fixture).textContent).toContain('Who is it for?');
    });

    it('closes with the typed recipient, trimmed', () => {
      const fixture = open();
      fillRequired(fixture);
      type(fixture, 'toEmail', ' orders@hilltopfarm.ie ');
      type(fixture, 'toName', ' Hilltop Farm ');
      sendButton(fixture).click();

      expect(closed[0]?.to).toEqual({ email: 'orders@hilltopfarm.ie', name: 'Hilltop Farm' });
      expect(closed[0]?.email.from).toBe('VENDORS');
    });

    it('previews for the typed recipient', () => {
      vi.useFakeTimers();
      const fixture = open();
      fillRequired(fixture);
      type(fixture, 'toEmail', 'orders@hilltopfarm.ie');
      type(fixture, 'toName', 'Hilltop Farm');
      vi.advanceTimersByTime(500);
      fixture.detectChanges();

      expect(preview).toHaveBeenLastCalledWith(
        { email: 'orders@hilltopfarm.ie', name: 'Hilltop Farm' },
        expect.objectContaining({ from: 'VENDORS' }),
      );
    });
  });
});
