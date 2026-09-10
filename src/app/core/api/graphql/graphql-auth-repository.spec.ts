import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { AuthRepository } from '../ports/auth-repository';
import { GraphqlAuthRepository } from './graphql-auth-repository';
import { UserRole } from './generated';
import { SIGN_IN } from '../../auth/auth-interceptor';
import { SESSION_STORAGE } from '../../auth/session-storage';
import { TokenStore } from '../../auth/token-store';
import { PasskeyCancelledError, WebAuthn } from '../../auth/webauthn';
import { AdminUser } from '../../models/admin-user.model';
import { environment } from '../../../../environments/environment';

/** What `startAuthentication` resolves to — opaque to the console, passed through as-is. */
const ASSERTION = { id: 'cred-1', rawId: 'cred-1', type: 'public-key', response: {} };

const OPTIONS = {
  data: {
    passkeyAuthenticationOptions: {
      challengeId: 'challenge-1',
      options: { challenge: 'abc', rpId: 'localhost' },
    },
  },
};

const signedIn = (role: UserRole) => ({
  data: {
    passkeyAuth: {
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      user: { id: 'usr-1', fullName: 'Áine Ryan', email: 'aine@marketday.ie', role },
    },
  },
});

/** How the backend answers a refused passkey: a real 401 carrying the exception's message. */
const REFUSED = {
  body: {
    errors: [
      {
        message: 'Invalid passkey',
        extensions: {
          code: 'UNAUTHENTICATED',
          originalError: { statusCode: 401, message: 'Invalid passkey', error: 'Unauthorized' },
        },
      },
    ],
  },
  init: { status: 401, statusText: 'Unauthorized' },
};

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => map.delete(k),
    setItem: (k, v) => void map.set(k, v),
  } as Storage;
}

let repository: AuthRepository;
let http: HttpTestingController;
let tokens: TokenStore;
let get: ReturnType<typeof vi.fn<(...args: unknown[]) => Observable<unknown>>>;

beforeEach(() => {
  get = vi.fn<(...args: unknown[]) => Observable<unknown>>(() => of(ASSERTION));
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: SESSION_STORAGE, useValue: memoryStorage() },
      { provide: WebAuthn, useValue: { get } },
      { provide: AuthRepository, useClass: GraphqlAuthRepository },
    ],
  });
  repository = TestBed.inject(AuthRepository);
  http = TestBed.inject(HttpTestingController);
  tokens = TestBed.inject(TokenStore);
});

afterEach(() => {
  http.verify();
  vi.useRealTimers();
});

/** The one pending post, checked to carry `operation` and the sign-in marker. */
function expectSignInCall(operation: string) {
  const request = http.expectOne(environment.api.graphqlUrl);
  const body = request.request.body as { query: string; variables?: Record<string, unknown> };
  expect(body.query).toContain(operation);
  expect(request.request.context.get(SIGN_IN)).toBe(true);
  return { request, variables: body.variables };
}

describe('GraphqlAuthRepository — passkeys', () => {
  it('fetches a challenge, has it signed, and trades the signature for a session', () => {
    let user: AdminUser | undefined;
    repository.signInWithPasskey().subscribe((u) => (user = u));

    expectSignInCall('mutation PasskeyAuthenticationOptions').request.flush(OPTIONS);
    expect(get).toHaveBeenCalledWith({ challenge: 'abc', rpId: 'localhost' }, { autofill: false });

    const verify = expectSignInCall('mutation PasskeyAuth(');
    expect(verify.variables).toEqual({
      input: { challengeId: 'challenge-1', response: ASSERTION },
    });
    verify.request.flush(signedIn(UserRole.Admin));

    expect(user).toEqual({
      id: 'usr-1',
      name: 'Áine Ryan',
      email: 'aine@marketday.ie',
      role: 'Admin',
    });
    expect(tokens.accessToken()).toBe('access-1');
    expect(tokens.refreshToken()).toBe('refresh-1');
  });

  it("turns away a non-admin's passkey before storing anything", () => {
    let error: unknown;
    repository.signInWithPasskey().subscribe({ error: (e) => (error = e) });

    expectSignInCall('mutation PasskeyAuthenticationOptions').request.flush(OPTIONS);
    expectSignInCall('mutation PasskeyAuth(').request.flush(signedIn(UserRole.Buyer));

    expect((error as Error).message).toBe('This account does not have admin access.');
    expect(tokens.accessToken()).toBeNull();
  });

  it("reports a refused passkey in the backend's words", () => {
    let error: unknown;
    repository.signInWithPasskey().subscribe({ error: (e) => (error = e) });

    expectSignInCall('mutation PasskeyAuthenticationOptions').request.flush(OPTIONS);
    expectSignInCall('mutation PasskeyAuth(').request.flush(REFUSED.body, REFUSED.init);

    expect((error as Error).message).toBe('Invalid passkey');
    expect(tokens.accessToken()).toBeNull();
  });

  it('lets a dismissed prompt through as a cancellation, sending nothing more', () => {
    get.mockReturnValue(throwError(() => new PasskeyCancelledError()));
    let error: unknown;
    repository.signInWithPasskey().subscribe({ error: (e) => (error = e) });

    expectSignInCall('mutation PasskeyAuthenticationOptions').request.flush(OPTIONS);

    expect(error).toBeInstanceOf(PasskeyCancelledError);
  });

  describe('as an autofill offer', () => {
    it('asks the browser for autofill rather than a prompt', () => {
      repository.signInWithPasskey({ autofill: true }).subscribe();

      expectSignInCall('mutation PasskeyAuthenticationOptions').request.flush(OPTIONS);
      expect(get).toHaveBeenCalledWith(expect.anything(), { autofill: true });
      expectSignInCall('mutation PasskeyAuth(').request.flush(signedIn(UserRole.Admin));
    });

    it('ends quietly when the offer cannot be made', () => {
      let completed = false;
      let error: unknown;
      repository
        .signInWithPasskey({ autofill: true })
        .subscribe({ complete: () => (completed = true), error: (e) => (error = e) });

      // The backend is unreachable.
      expectSignInCall('mutation PasskeyAuthenticationOptions').request.error(
        new ProgressEvent('error'),
      );

      expect(error).toBeUndefined();
      expect(completed).toBe(true);
    });

    it('ends quietly when the button withdraws it', () => {
      get.mockReturnValue(throwError(() => new PasskeyCancelledError()));
      let completed = false;
      repository
        .signInWithPasskey({ autofill: true })
        .subscribe({ complete: () => (completed = true) });

      expectSignInCall('mutation PasskeyAuthenticationOptions').request.flush(OPTIONS);

      expect(completed).toBe(true);
    });

    it('still reports a passkey that was picked and then refused', () => {
      let error: unknown;
      repository.signInWithPasskey({ autofill: true }).subscribe({ error: (e) => (error = e) });

      expectSignInCall('mutation PasskeyAuthenticationOptions').request.flush(OPTIONS);
      expectSignInCall('mutation PasskeyAuth(').request.flush(REFUSED.body, REFUSED.init);

      expect((error as Error).message).toBe('Invalid passkey');
    });

    it('renews itself before the challenge behind it lapses', () => {
      vi.useFakeTimers();
      // Nobody picks a passkey: the offer just sits in the email field.
      get.mockReturnValue(NEVER);
      repository.signInWithPasskey({ autofill: true }).subscribe();
      expectSignInCall('mutation PasskeyAuthenticationOptions').request.flush(OPTIONS);

      vi.advanceTimersByTime(4 * 60 * 1000);
      http.expectNone(environment.api.graphqlUrl);

      vi.advanceTimersByTime(60 * 1000);
      expectSignInCall('mutation PasskeyAuthenticationOptions').request.flush(OPTIONS);
      expect(get).toHaveBeenCalledTimes(2);
    });
  });
});
