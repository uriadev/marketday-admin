import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { ACCOUNTS_FIXTURE } from '../../../core/api/in-memory/in-memory-account-repository';
import { AdminEmail } from '../../../core/models/account.model';
import { SendEmailDialog, SendEmailDialogData } from './send-email-dialog';

const ACCOUNT = ACCOUNTS_FIXTURE.find((account) => account.status === 'active')!;

const closed: (AdminEmail | undefined)[] = [];
const ref = { close: (email?: AdminEmail) => closed.push(email) };
const preview = vi.fn((email: AdminEmail) =>
  of({ subject: email.subject, html: `<h1>${email.heading}</h1>` }),
);

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

function fillRequired(fixture: ReturnType<typeof open>) {
  type(fixture, 'subject', 'About Saturday');
  type(fixture, 'heading', 'The market moves indoors');
  type(fixture, 'body', 'First paragraph.\n\nSecond paragraph.');
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
    const data: SendEmailDialogData = { account: ACCOUNT, preview };
    await TestBed.configureTestingModule({
      imports: [SendEmailDialog],
      providers: [
        provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: ref },
      ],
    }).compileComponents();
  });

  afterEach(() => vi.useRealTimers());

  it('names who it goes to, with the template eyebrow filled in', () => {
    const fixture = open();
    const text = host(fixture).textContent ?? '';

    expect(text).toContain(`Email ${ACCOUNT.name}`);
    expect(text).toContain(ACCOUNT.email);
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
        subject: 'About Saturday',
        eyebrow: 'From the MarketDay team',
        heading: 'The market moves indoors',
        body: 'First paragraph.\n\nSecond paragraph.',
        cta: null,
      },
    ]);
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
    expect(closed[0]?.cta).toEqual({ label: 'See the market', url: 'https://marketday.ie/m/1' });
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
    expect(preview.mock.calls[0]![0].heading).toBe('The market moves indoors');
    expect(host(fixture).querySelector('iframe[title="Email preview"]')).not.toBeNull();
  });
});
