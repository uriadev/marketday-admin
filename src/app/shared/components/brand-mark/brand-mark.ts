import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The MarketDay glyph — a rounded square in brand green. Presentational only;
 * callers pair it with their own wordmark and heading.
 */
@Component({
  selector: 'md-brand-mark',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
  host: {
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
    '[style.border-radius.px]': 'size() * 0.26',
  },
  styles: `
    :host {
      display: inline-block;
      flex-shrink: 0;
      background: var(--mat-sys-primary);
    }
  `,
})
export class BrandMark {
  /** Edge length in pixels. */
  readonly size = input(34);
}
