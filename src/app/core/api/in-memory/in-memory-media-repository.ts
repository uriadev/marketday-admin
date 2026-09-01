import { Injectable } from '@angular/core';
import { Observable, from, of } from 'rxjs';
import { delay, switchMap } from 'rxjs/operators';
import { MediaKind, MediaRepository, UploadedImage } from '../ports/media-repository';

/**
 * Fixture uploads. The file never leaves the browser — it is read into a data
 * URL, which is a real, renderable `src` and survives being stored on the
 * market like any other URL would. A GraphQL/S3 adapter replaces this class
 * without anything above `core/` noticing.
 */
@Injectable()
export class InMemoryMediaRepository extends MediaRepository {
  /** `kind` only matters to the real backend, which mutation picks the bucket. */
  override upload(file: File, kind: MediaKind): Observable<UploadedImage> {
    return from(readAsDataUrl(file)).pipe(
      switchMap((url) =>
        of<UploadedImage>({ url, fileName: file.name, sizeBytes: file.size }).pipe(delay(300)),
      ),
    );
  }
}

/** `FileReader` is only touched here, inside a browser-only code path. */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}
