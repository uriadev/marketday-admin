import { Observable } from 'rxjs';

/** What an upload gives back — the URL is the only part the domain stores. */
export interface UploadedImage {
  readonly url: string;
  readonly fileName: string;
  readonly sizeBytes: number;
}

/**
 * Port for binary uploads. Declared as an abstract class so it doubles as its
 * own DI token while staying a checkable type — see `api.providers.ts`.
 */
export abstract class MediaRepository {
  abstract upload(file: File): Observable<UploadedImage>;
}
