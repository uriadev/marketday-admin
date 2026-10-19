import { AbstractControl, ValidationErrors } from '@angular/forms';

/**
 * An optional link that must be `https:` when given — what the backend
 * enforces on an event's `externalUrl` and a promotion's `linkUrl`. Empty
 * passes; pair it with `Validators.required` where a link is mandatory.
 */
export function httpsUrl(control: AbstractControl<string | null>): ValidationErrors | null {
  const value = control.value?.trim();
  if (!value) return null;
  try {
    return new URL(value).protocol === 'https:' ? null : { httpsUrl: true };
  } catch {
    return { httpsUrl: true };
  }
}
