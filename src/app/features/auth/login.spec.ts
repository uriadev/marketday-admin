import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Subject } from 'rxjs';
import { AuthStore } from '../../core/auth/auth-store';
import { SignInChallenge } from '../../core/api/ports/auth-repository';
import { Login } from './login';

describe('Login', () => {
  let requestCode: ReturnType<typeof vi.fn>;
  let challenge$: Subject<SignInChallenge>;

  beforeEach(async () => {
    challenge$ = new Subject<SignInChallenge>();
    requestCode = vi.fn(() => challenge$.asObservable());

    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        { provide: AuthStore, useValue: { requestCode } },
      ],
    }).compileComponents();
  });

  it('does not call the store while the form is invalid', () => {
    const fixture = TestBed.createComponent(Login);
    fixture.componentInstance['submit']();
    expect(requestCode).not.toHaveBeenCalled();
  });

  it('requests a code with the entered credentials', () => {
    const fixture = TestBed.createComponent(Login);
    const component = fixture.componentInstance;
    component['form'].setValue({ email: 'aine@marketday.ie', password: 'password123' });

    component['submit']();

    expect(requestCode).toHaveBeenCalledWith('aine@marketday.ie', 'password123');
    expect(component['submitting']()).toBe(true);
  });

  it('surfaces a server error message', () => {
    const fixture = TestBed.createComponent(Login);
    const component = fixture.componentInstance;
    component['form'].setValue({ email: 'aine@marketday.ie', password: 'password123' });

    component['submit']();
    challenge$.error(new Error('That email and password don’t match an account.'));

    expect(component['submitting']()).toBe(false);
    expect(component['errorMessage']()).toContain('match an account');
  });
});
