import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ImageUpload } from './image-upload';

describe('ImageUpload', () => {
  let fixture: ComponentFixture<ImageUpload>;
  let component: ImageUpload;

  const png = (name = 'cover.png', bytes = 'x') => new File([bytes], name, { type: 'image/png' });

  /** Picking a file, the way the browser hands it over on `change`. */
  function pick(file: File): void {
    const input = fixture.nativeElement.querySelector('.md-upload__input') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ImageUpload] });
    fixture = TestBed.createComponent(ImageUpload);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('label', 'Cover image');
    fixture.detectChanges();
  });

  it('emits the picked file when it passes the type and size checks', () => {
    const selected: File[] = [];
    component.selected.subscribe((file) => selected.push(file));

    pick(png());

    expect(selected.length).toBe(1);
    expect(selected[0].name).toBe('cover.png');
  });

  it('turns away a file of the wrong type, naming the accepted ones', () => {
    const rejections: string[] = [];
    const selected: File[] = [];
    component.rejected.subscribe((reason) => rejections.push(reason));
    component.selected.subscribe((file) => selected.push(file));

    pick(new File(['%PDF'], 'insurance.pdf', { type: 'application/pdf' }));

    expect(selected).toEqual([]);
    expect(rejections).toEqual(['Cover image must be a PNG, JPG or WebP image.']);
  });

  it('turns away a file over the size limit', () => {
    const rejections: string[] = [];
    fixture.componentRef.setInput('maxSizeMb', 1);
    fixture.detectChanges();
    component.rejected.subscribe((reason) => rejections.push(reason));

    pick(png('huge.png', 'x'.repeat(1024 * 1024 + 1)));

    expect(rejections).toEqual(['Cover image must be under 1 MB.']);
  });

  it('shows the preview and a remove control once it has a source', () => {
    expect(fixture.nativeElement.querySelector('.md-upload__preview')).toBeNull();
    expect(fixture.nativeElement.querySelector('.md-upload__remove')).toBeNull();

    fixture.componentRef.setInput('src', 'data:image/png;base64,AAAA');
    fixture.detectChanges();

    const preview = fixture.nativeElement.querySelector('.md-upload__preview') as HTMLImageElement;
    expect(preview.getAttribute('src')).toBe('data:image/png;base64,AAAA');
    expect(fixture.nativeElement.querySelector('.md-upload__remove')).not.toBeNull();
  });

  it('emits cleared when the remove control is pressed, without opening the picker', () => {
    let cleared = 0;
    let pickerOpened = 0;
    component.cleared.subscribe(() => cleared++);
    fixture.componentRef.setInput('src', 'data:image/png;base64,AAAA');
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('.md-upload__input') as HTMLInputElement;
    input.click = () => pickerOpened++;
    const remove = fixture.nativeElement.querySelector('.md-upload__remove') as HTMLButtonElement;
    remove.click();

    expect(cleared).toBe(1);
    expect(pickerOpened).toBe(0);
  });

  it('opens the picker when the zone itself is clicked', () => {
    let pickerOpened = 0;
    const input = fixture.nativeElement.querySelector('.md-upload__input') as HTMLInputElement;
    input.click = () => pickerOpened++;

    (fixture.nativeElement.querySelector('.md-upload__zone') as HTMLElement).click();

    expect(pickerOpened).toBe(1);
  });

  it('ignores a pick while an upload is in flight', () => {
    const selected: File[] = [];
    component.selected.subscribe((file) => selected.push(file));
    fixture.componentRef.setInput('busy', true);
    fixture.detectChanges();

    pick(png());

    expect(selected).toEqual([]);
  });
});
