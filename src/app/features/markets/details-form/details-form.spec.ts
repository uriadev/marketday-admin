import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { of, throwError } from 'rxjs';
import { MediaRepository, UploadedImage } from '../../../core/api/ports/media-repository';
import { MarketType } from '../../../core/models/market.model';
import { ImageUpload } from '../../../shared/components/image-upload/image-upload';
import {
  DetailsFormGroup,
  MarketDetailsForm,
  createDetailsForm,
  detailsFields,
} from './details-form';

/**
 * The details form's job is to write the fields the wizard and the settings
 * tab both edit — name, slug, type, description, images, stalls — and to own
 * the upload round trip so neither host touches `MediaRepository` directly.
 */
describe('MarketDetailsForm', () => {
  let fixture: ComponentFixture<MarketDetailsForm>;
  let group: DetailsFormGroup;
  let media: { upload: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    media = {
      upload: vi.fn(() =>
        of<UploadedImage>({ url: 'blob:cover', fileName: 'cover.png', sizeBytes: 100 }),
      ),
    };
    TestBed.configureTestingModule({
      imports: [MarketDetailsForm],
      providers: [{ provide: MediaRepository, useValue: media }],
    });
    group = TestBed.runInInjectionContext(() => createDetailsForm());
    fixture = TestBed.createComponent(MarketDetailsForm);
    fixture.componentRef.setInput('form', group);
    fixture.detectChanges();
  });

  it('needs a name, a slug, a type, a stall count and a fee', () => {
    expect(group.controls.name.hasError('required')).toBe(true);
    expect(group.controls.slug.hasError('required')).toBe(true);
    expect(group.controls.marketType.hasError('required')).toBe(true);
    expect(group.controls.stallCount.hasError('required')).toBe(true);
    expect(group.controls.stallFeePerDay.hasError('required')).toBe(true);
  });

  it('slugifies the name as it is typed, until the slug is edited by hand', () => {
    const nameInput = fixture.nativeElement.querySelector('input[formcontrolname="name"]');
    group.controls.name.setValue('Temple Bar Food Market!');
    nameInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(group.controls.slug.value).toBe('temple-bar-food-market');

    // Once the organiser edits the slug themselves, typing the name stops overwriting it.
    group.controls.slug.setValue('custom-slug');
    group.controls.slug.markAsDirty();
    group.controls.name.setValue('Renamed Market');
    nameInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(group.controls.slug.value).toBe('custom-slug');
  });

  it('uploads through MediaRepository and stores only the URL', () => {
    const uploads = fixture.debugElement.queryAll(By.directive(ImageUpload));
    const cover = uploads[0].componentInstance as ImageUpload;

    const file = new File(['x'], 'cover.png', { type: 'image/png' });
    cover.selected.emit(file);

    expect(media.upload).toHaveBeenCalledWith(file);
    expect(group.controls.imageUrl.value).toBe('blob:cover');
    expect(group.controls.imageUrl.dirty).toBe(true);
  });

  it('clears an image without touching the other one', () => {
    group.controls.imageUrl.setValue('blob:cover');
    group.controls.bannerUrl.setValue('blob:banner');

    const uploads = fixture.debugElement.queryAll(By.directive(ImageUpload));
    (uploads[0].componentInstance as ImageUpload).cleared.emit();

    expect(group.controls.imageUrl.value).toBeNull();
    expect(group.controls.bannerUrl.value).toBe('blob:banner');
  });

  it('reports a failed upload without leaving the zone stuck busy', () => {
    media.upload.mockReturnValue(throwError(() => new Error('too big')));
    const uploads = fixture.debugElement.queryAll(By.directive(ImageUpload));

    (uploads[0].componentInstance as ImageUpload).selected.emit(new File(['x'], 'cover.png'));
    fixture.detectChanges();

    expect(group.controls.imageUrl.value).toBeNull();
    // Protected member: index access is the sanctioned way to reach it.
    expect(fixture.componentInstance['uploading']()).toBeNull();
  });
});

describe('detailsFields', () => {
  it('maps the raw form value onto the patch the repository expects', () => {
    const form = TestBed.runInInjectionContext(() => createDetailsForm());
    form.patchValue({
      name: 'Temple Bar Food Market',
      slug: 'temple-bar',
      marketType: MarketType.FoodProduce,
      stallCount: 20,
      stallFeePerDay: 35,
    });

    expect(detailsFields(form.getRawValue())).toEqual({
      name: 'Temple Bar Food Market',
      slug: 'temple-bar',
      marketType: MarketType.FoodProduce,
      description: '',
      imageUrl: null,
      bannerUrl: null,
      stallCount: 20,
      stallFeePerDay: 35,
      reviewApplications: true,
      acceptsPreOrders: true,
    });
  });
});
