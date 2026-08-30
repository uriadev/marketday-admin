import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Observable, of, throwError } from 'rxjs';
import { MediaRepository, UploadedImage } from '../../core/api/ports/media-repository';
import { ProfileRepository } from '../../core/api/ports/profile-repository';
import { AdminProfile, AdminProfilePatch } from '../../core/models/admin-user.model';
import { Profile } from './profile';
import { ProfileFacade } from './profile-facade';

const SEED: AdminProfile = {
  id: 'usr_aine',
  firstName: 'Áine',
  lastName: 'Ryan',
  email: 'aine@marketday.ie',
  phone: '+353 87 214 4471',
  role: 'Super admin',
  avatarUrl: null,
  passwordChanged: 'Last changed 4 months ago',
  twoFactor: true,
  twoFactorHint: 'SMS to number ending 4471',
  notifications: {
    payoutSummary: true,
    vendorApplications: true,
    marketDayReminders: false,
  },
};

/** The last patch a save sent, so a spec can assert what was written. */
let saved: AdminProfilePatch | null = null;
let resetsSent = 0;

class StubProfileRepository extends ProfileRepository {
  private current = SEED;

  override profile(): Observable<AdminProfile> {
    return of(this.current);
  }

  override save(patch: AdminProfilePatch): Observable<AdminProfile> {
    saved = patch;
    this.current = {
      ...this.current,
      ...patch,
      notifications: { ...patch.notifications },
      twoFactorHint: patch.twoFactor ? this.current.twoFactorHint : 'Off',
    };
    return of(this.current);
  }

  override sendPasswordReset(): Observable<void> {
    resetsSent += 1;
    return of(undefined);
  }
}

class StubMediaRepository extends MediaRepository {
  override upload(file: File): Observable<UploadedImage> {
    return of({ url: `stored:${file.name}`, fileName: file.name, sizeBytes: file.size });
  }
}

function open() {
  const fixture = TestBed.createComponent(Profile);
  fixture.detectChanges();
  return fixture;
}

function host(fixture: { nativeElement: unknown }): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function text(fixture: { nativeElement: unknown }): string {
  return host(fixture).textContent ?? '';
}

/** The input under a `mat-form-field` whose label reads `label`. */
function field(fixture: { nativeElement: unknown }, label: string): HTMLInputElement {
  const match = Array.from(host(fixture).querySelectorAll('mat-form-field')).find((wrapper) =>
    wrapper.querySelector('mat-label')?.textContent?.trim().startsWith(label),
  );
  expect(match).toBeDefined();
  return match!.querySelector('input') as HTMLInputElement;
}

function type(
  fixture: { nativeElement: unknown; detectChanges(): void },
  label: string,
  value: string,
) {
  const input = field(fixture, label);
  input.value = value;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

function button(fixture: { nativeElement: unknown }, label: string): HTMLButtonElement {
  const match = Array.from(host(fixture).querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.trim().startsWith(label),
  );
  expect(match).toBeDefined();
  return match as HTMLButtonElement;
}

/** The slide toggle whose aria-label reads `label`. */
function toggle(fixture: { nativeElement: unknown }, label: string): HTMLInputElement {
  const match = Array.from(host(fixture).querySelectorAll('mat-slide-toggle')).find(
    (element) => element.querySelector('button')?.getAttribute('aria-label') === label,
  );
  expect(match).toBeDefined();
  return match!.querySelector('button') as unknown as HTMLInputElement;
}

describe('Profile', () => {
  beforeEach(async () => {
    saved = null;
    resetsSent = 0;
    await TestBed.configureTestingModule({
      imports: [Profile],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        ProfileFacade,
        { provide: ProfileRepository, useClass: StubProfileRepository },
        { provide: MediaRepository, useClass: StubMediaRepository },
      ],
    }).compileComponents();
  });

  it('fills the form from the signed-in account', () => {
    const fixture = open();

    expect(field(fixture, 'First name').value).toBe('Áine');
    expect(field(fixture, 'Last name').value).toBe('Ryan');
    expect(field(fixture, 'Email').value).toBe('aine@marketday.ie');
    expect(field(fixture, 'Phone').value).toBe('+353 87 214 4471');
    expect(field(fixture, 'Role').value).toBe('Super admin');
    expect(text(fixture)).toContain('How you appear to vendors and other organisers.');
  });

  it('shows but will not let anyone edit their own email or role', () => {
    const fixture = open();

    expect(field(fixture, 'Email').disabled).toBe(true);
    expect(field(fixture, 'Role').disabled).toBe(true);
    expect(text(fixture)).toContain('Only a super admin can change this');
    // Neither reaches the patch, whatever the form is holding.
    type(fixture, 'Phone', '+353 87 000 0000');
    button(fixture, 'Save changes').click();
    fixture.detectChanges();
    expect(Object.keys(saved ?? {})).not.toContain('email');
    expect(Object.keys(saved ?? {})).not.toContain('role');
  });

  it('carries the security settings the account actually has', () => {
    const fixture = open();

    expect(text(fixture)).toContain('Last changed 4 months ago');
    expect(text(fixture)).toContain('SMS to number ending 4471');
    expect(toggle(fixture, 'Two-factor authentication').getAttribute('aria-checked')).toBe('true');
  });

  it('lists the three notifications, on and off as recorded', () => {
    const fixture = open();

    expect(toggle(fixture, 'Weekly vendor payout summary').getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(toggle(fixture, 'New vendor applications').getAttribute('aria-checked')).toBe('true');
    expect(toggle(fixture, 'Market day reminders').getAttribute('aria-checked')).toBe('false');
  });

  it('keeps Save inert until something actually changes', () => {
    const fixture = open();

    expect(button(fixture, 'Save changes').disabled).toBe(true);
    expect(button(fixture, 'Cancel').disabled).toBe(true);

    type(fixture, 'First name', 'Áinín');

    expect(button(fixture, 'Save changes').disabled).toBe(false);
  });

  it('saves the whole account, including the toggles', () => {
    const fixture = open();

    toggle(fixture, 'Market day reminders').click();
    fixture.detectChanges();

    button(fixture, 'Save changes').click();
    fixture.detectChanges();

    expect(saved?.notifications.marketDayReminders).toBe(true);
    // Untouched values go with it — this is the account, not a field patch.
    expect(saved?.firstName).toBe('Áine');
    expect(saved?.twoFactor).toBe(true);
    expect(button(fixture, 'Save changes').disabled).toBe(true);
  });

  it('says the second factor is off once it is turned off', () => {
    const fixture = open();

    toggle(fixture, 'Two-factor authentication').click();
    fixture.detectChanges();

    // The hint follows the switch before the save, not after.
    expect(text(fixture)).toContain('Off');
    expect(text(fixture)).not.toContain('SMS to number ending 4471');
  });

  it('drops unsaved edits back to the loaded account', () => {
    const fixture = open();

    type(fixture, 'First name', 'Somebody else');
    button(fixture, 'Cancel').click();
    fixture.detectChanges();

    expect(field(fixture, 'First name').value).toBe('Áine');
    expect(button(fixture, 'Save changes').disabled).toBe(true);
    expect(saved).toBeNull();
  });

  it('refuses to save an account with no name', () => {
    const fixture = open();

    type(fixture, 'First name', '');
    button(fixture, 'Save changes').click();
    fixture.detectChanges();

    expect(saved).toBeNull();
    expect(text(fixture)).toContain('Give your first name');
  });

  it('emails a reset link rather than taking a new password inline', () => {
    const fixture = open();

    expect(host(fixture).querySelector('input[type="password"]')).toBeNull();
    button(fixture, 'Change').click();
    fixture.detectChanges();

    expect(resetsSent).toBe(1);
  });

  it('takes a photo through the media repository and offers to remove it', () => {
    const fixture = open();

    // Nothing to remove until there is a photo.
    expect(
      Array.from(host(fixture).querySelectorAll('button')).some((candidate) =>
        candidate.textContent?.trim().startsWith('Remove'),
      ),
    ).toBe(false);

    const picker = host(fixture).querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'face.png', { type: 'image/png' });
    Object.defineProperty(picker, 'files', { value: [file] });
    picker.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(host(fixture).querySelector('md-avatar img')?.getAttribute('src')).toBe(
      'stored:face.png',
    );

    button(fixture, 'Remove').click();
    fixture.detectChanges();
    expect(host(fixture).querySelector('md-avatar img')).toBeNull();
  });

  it('turns away a photo that is not a JPG or PNG', () => {
    const fixture = open();

    const picker = host(fixture).querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'face.gif', { type: 'image/gif' });
    Object.defineProperty(picker, 'files', { value: [file] });
    picker.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(host(fixture).querySelector('md-avatar img')).toBeNull();
    expect(text(fixture)).toContain('JPG or PNG, at least 200×200px.');
  });
});

/** The account refusing to load — the screen has to say so, not sit blank. */
class FailingProfileRepository extends StubProfileRepository {
  override profile(): Observable<AdminProfile> {
    return throwError(() => new Error('Your account could not be loaded.'));
  }
}

describe('Profile when the account will not load', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Profile],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        ProfileFacade,
        { provide: ProfileRepository, useClass: FailingProfileRepository },
        { provide: MediaRepository, useClass: StubMediaRepository },
      ],
    }).compileComponents();
  });

  it('reports the error and offers a retry', () => {
    const fixture = open();

    expect(text(fixture)).toContain('Your account could not be loaded.');
    expect(text(fixture)).toContain('Retry');
    expect(host(fixture).querySelector('form')).toBeNull();
  });
});
