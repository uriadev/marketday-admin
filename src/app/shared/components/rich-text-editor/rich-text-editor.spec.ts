import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { RichTextEditor } from './rich-text-editor';

@Component({
  imports: [ReactiveFormsModule, RichTextEditor],
  template: `<md-rich-text-editor label="Message" [formControl]="body" />`,
})
class Host {
  readonly body = new FormControl('<p>Hello <strong>there</strong></p>', { nonNullable: true });
}

function open() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  return fixture;
}

function host(fixture: { nativeElement: unknown }): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

describe('RichTextEditor', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideNoopAnimations()],
    }).compileComponents();
  });

  it('shows the value it was given, formatted', () => {
    const fixture = open();
    const surface = host(fixture).querySelector('[role="textbox"]')!;

    expect(surface.getAttribute('aria-label')).toBe('Message');
    expect(surface.innerHTML).toContain('<strong>there</strong>');
  });

  it('takes a value written later without reporting it back as an edit', () => {
    const fixture = open();
    fixture.componentInstance.body.setValue('<ul><li><p>One</p></li></ul>');
    fixture.detectChanges();

    expect(host(fixture).querySelector('[role="textbox"] li')?.textContent).toBe('One');
    expect(fixture.componentInstance.body.dirty).toBe(false);
  });

  it('offers the formats the email keeps, and a link', () => {
    const fixture = open();
    const labels = Array.from(host(fixture).querySelectorAll('[role="toolbar"] button')).map(
      (button) => button.getAttribute('aria-label'),
    );

    expect(labels).toEqual([
      'Bold',
      'Italic',
      'Underline',
      'Bulleted list',
      'Numbered list',
      'Quote',
      'Link',
    ]);
  });

  it('becomes read-only with its control', () => {
    const fixture = open();
    fixture.componentInstance.body.disable();
    fixture.detectChanges();

    const surface = host(fixture).querySelector('[role="textbox"]')!;
    expect(surface.getAttribute('contenteditable')).toBe('false');
  });
});
