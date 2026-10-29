import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  ViewEncapsulation,
  forwardRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  ControlValueAccessor,
  FormControl,
  NG_VALUE_ACCESSOR,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';

/** One toolbar toggle: the mark or node it reflects, and the command it runs. */
interface FormatButton {
  icon: string;
  label: string;
  /** What `editor.isActive` is asked, for `aria-pressed`. */
  active: string;
  run: (editor: Editor) => void;
}

const FORMATS: readonly FormatButton[] = [
  {
    icon: 'format_bold',
    label: 'Bold',
    active: 'bold',
    run: (e) => e.chain().focus().toggleBold().run(),
  },
  {
    icon: 'format_italic',
    label: 'Italic',
    active: 'italic',
    run: (e) => e.chain().focus().toggleItalic().run(),
  },
  {
    icon: 'format_underlined',
    label: 'Underline',
    active: 'underline',
    run: (e) => e.chain().focus().toggleUnderline().run(),
  },
  {
    icon: 'format_list_bulleted',
    label: 'Bulleted list',
    active: 'bulletList',
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    icon: 'format_list_numbered',
    label: 'Numbered list',
    active: 'orderedList',
    run: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    icon: 'format_quote',
    label: 'Quote',
    active: 'blockquote',
    run: (e) => e.chain().focus().toggleBlockquote().run(),
  },
];

/** Only links a mail client will follow safely — what the backend keeps, too. */
const LINK_PATTERN = /^\s*(https:\/\/\S+|mailto:\S+@\S+)\s*$/;

/**
 * A small rich-text editor for email copy: paragraphs, bold / italic /
 * underline, lists, quotes and links — exactly what the backend's email
 * sanitiser keeps, so nothing the admin formats is silently lost on send.
 *
 * It is a form control (`ControlValueAccessor`) whose value is the editor's
 * HTML, or `''` while it holds no words. TipTap is created only in the
 * browser, after the view exists; on the server the surface stays empty.
 *
 * Not a Material component, so its chrome is drawn here with tokens, styled
 * like the outlined fields around it. Encapsulation is off because the
 * editable DOM is ProseMirror's, not this template's — the rules are scoped
 * under `.md-rte` instead.
 */
@Component({
  selector: 'md-rich-text-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatTooltipModule,
  ],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => RichTextEditor),
      multi: true,
    },
  ],
  templateUrl: './rich-text-editor.html',
  styleUrl: './rich-text-editor.css',
})
export class RichTextEditor implements ControlValueAccessor, AfterViewInit, OnDestroy {
  /** Shown above the surface, and the editable region's accessible name. */
  readonly label = input.required<string>();
  /** Draws the error outline; the message itself is the caller's. */
  readonly invalid = input(false);

  protected readonly formats = FORMATS;

  private readonly surface = viewChild.required<ElementRef<HTMLElement>>('surface');
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private editor: Editor | null = null;
  /** A value written before the editor existed, applied once it does. */
  private pending = '';
  private onChange: (html: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  /** Bumped on every editor transaction, so toolbar states re-read. */
  protected readonly revision = signal(0);
  protected readonly disabled = signal(false);
  protected readonly focused = signal(false);

  protected readonly linkOpen = signal(false);
  protected readonly linkUrl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(LINK_PATTERN)],
  });

  ngAfterViewInit(): void {
    if (!this.isBrowser) return;
    this.editor = new Editor({
      element: this.surface().nativeElement,
      editable: !this.disabled(),
      extensions: [
        StarterKit.configure({
          heading: false,
          code: false,
          codeBlock: false,
          horizontalRule: false,
          link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
        }),
      ],
      content: this.pending,
      editorProps: {
        attributes: {
          role: 'textbox',
          'aria-multiline': 'true',
          'aria-label': this.label(),
        },
      },
      onUpdate: ({ editor }) => this.onChange(valueOf(editor)),
      onTransaction: () => this.revision.update((n) => n + 1),
      onFocus: () => this.focused.set(true),
      onBlur: () => {
        this.focused.set(false);
        this.onTouched();
      },
    });
  }

  ngOnDestroy(): void {
    this.editor?.destroy();
  }

  writeValue(html: string | null): void {
    const value = html ?? '';
    if (!this.editor) {
      this.pending = value;
      return;
    }
    if (valueOf(this.editor) === value) return;
    this.editor.commands.setContent(value, { emitUpdate: false });
  }

  registerOnChange(fn: (html: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
    this.editor?.setEditable(!disabled);
  }

  protected isActive(name: string): boolean {
    this.revision();
    return this.editor?.isActive(name) ?? false;
  }

  protected apply(format: FormatButton): void {
    if (this.editor) format.run(this.editor);
  }

  protected openLink(): void {
    if (!this.editor) return;
    const current = this.editor.getAttributes('link')['href'] as string | undefined;
    this.linkUrl.reset(current ?? 'https://');
    this.linkOpen.set(true);
  }

  protected saveLink(): void {
    if (!this.editor) return;
    if (this.linkUrl.invalid) {
      this.linkUrl.markAsTouched();
      return;
    }
    const href = this.linkUrl.value.trim();
    const chain = this.editor.chain().focus().extendMarkRange('link');
    // With nothing selected there is nothing to wrap, so the address itself
    // becomes the linked text.
    if (this.editor.state.selection.empty && !this.editor.isActive('link')) {
      chain.insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] });
    } else {
      chain.setLink({ href });
    }
    chain.run();
    this.linkOpen.set(false);
  }

  protected removeLink(): void {
    this.editor?.chain().focus().extendMarkRange('link').unsetLink().run();
    this.linkOpen.set(false);
  }

  protected cancelLink(): void {
    this.linkOpen.set(false);
    this.editor?.commands.focus();
  }
}

/** The HTML, or `''` for an editor holding no words — what `required` reads. */
function valueOf(editor: Editor): string {
  return editor.getText().trim() === '' ? '' : editor.getHTML();
}
