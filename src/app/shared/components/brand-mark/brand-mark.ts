import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The MarketDay glyph — the woven basket from `public/logo.svg`. Decorative:
 * every caller pairs it with the wordmark, so the image carries no alt text.
 */
@Component({
  selector: 'md-brand-mark',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<img src="logo.svg" alt="" [width]="size()" [height]="size()" />`,
  host: {
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
  },
  styles: `
    :host {
      display: inline-block;
      flex-shrink: 0;
    }

    img {
      display: block;
      width: 100%;
      height: 100%;
    }
  `,
})
export class BrandMark {
  /** Edge length in pixels. */
  readonly size = input(34);
}
