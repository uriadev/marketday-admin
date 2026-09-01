import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { authInterceptor } from './auth-interceptor';
import { SessionExpiry } from './session-expiry';
import { SESSION_STORAGE } from './session-storage';
import { TokenStore } from './token-store';

const GQL = '/graphql';
/** How this backend actually reports an expired/absent token: a 200 whose body carries an `errors` entry. */
const UNAUTHORIZED = { errors: [{ message: 'Unauthorized' }] };
const SESSION_EXPIRED = 'Your session has expired. Sign in again.';

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

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let tokens: TokenStore;
  let expire: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: SESSION_STORAGE, useValue: memoryStorage() },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    tokens = TestBed.inject(TokenStore);
    expire = vi.spyOn(TestBed.inject(SessionExpiry), 'expire');
  });

  afterEach(() => httpMock.verify());

  it('expires the session when an unauthorized response cannot be refreshed', () => {
    let error: unknown;
    http.post(GQL, { query: 'q' }).subscribe({ error: (e) => (error = e) });

    // No refresh token stored, so the refresh is skipped and the session is gone.
    httpMock.expectOne(GQL).flush(UNAUTHORIZED);

    expect(expire).toHaveBeenCalledTimes(1);
    expect((error as Error).message).toBe(SESSION_EXPIRED);
  });

  it('refreshes once and replays the request with the new token', () => {
    tokens.set('access-old', 'refresh-1');
    let body: unknown;
    http.post(GQL, { query: 'q' }).subscribe({ next: (b) => (body = b) });

    const first = httpMock.expectOne(GQL);
    expect(first.request.headers.get('Authorization')).toBe('Bearer access-old');
    first.flush(UNAUTHORIZED);

    const refresh = httpMock.expectOne(GQL);
    expect(refresh.request.headers.get('Authorization')).toBe('Bearer refresh-1');
    refresh.flush({ data: { session: { accessToken: 'access-new', refreshToken: 'refresh-2' } } });

    const replay = httpMock.expectOne(GQL);
    expect(replay.request.headers.get('Authorization')).toBe('Bearer access-new');
    replay.flush({ data: { ok: true } });

    expect(body).toEqual({ data: { ok: true } });
    expect(expire).not.toHaveBeenCalled();
    expect(tokens.accessToken()).toBe('access-new');
  });

  it('expires the session when the replayed request is still unauthorized', () => {
    tokens.set('access-old', 'refresh-1');
    let error: unknown;
    http.post(GQL, { query: 'q' }).subscribe({ error: (e) => (error = e) });

    httpMock.expectOne(GQL).flush(UNAUTHORIZED);
    httpMock
      .expectOne(GQL)
      .flush({ data: { session: { accessToken: 'access-new', refreshToken: 'refresh-2' } } });
    httpMock.expectOne(GQL).flush(UNAUTHORIZED);

    expect(expire).toHaveBeenCalledTimes(1);
    expect((error as Error).message).toBe(SESSION_EXPIRED);
  });

  it('leaves non-GraphQL requests (presigned uploads) untouched', () => {
    const url = 'https://uploads.example/object';
    let error: unknown;
    http.put(url, 'blob').subscribe({ error: (e) => (error = e) });

    const req = httpMock.expectOne(url);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush('denied', { status: 401, statusText: 'Unauthorized' });

    expect(expire).not.toHaveBeenCalled();
    expect((error as { status?: number }).status).toBe(401);
  });
});
