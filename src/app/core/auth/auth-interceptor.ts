import {
  HttpClient,
  HttpContext,
  HttpContextToken,
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { catchError, finalize, map, shareReplay, switchMap, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { GraphQlResponseBody, isUnauthenticated } from '../api/graphql/graphql-errors';
import { REFRESH_SESSION } from '../api/graphql/operations/auth';
import { RefreshSessionMutation, RefreshSessionMutationVariables } from '../api/graphql/generated';
import { SessionExpiry } from './session-expiry';
import { TokenStore } from './token-store';

/**
 * Marks the refresh mutation itself, so this interceptor knows to send the
 * *refresh* token as the bearer (not the access token) and — critically — not
 * to attempt another refresh if this particular call comes back unauthorised.
 * Without that second part, an expired refresh token would recurse forever.
 */
export const SKIP_REFRESH = new HttpContextToken<boolean>(() => false);

/**
 * Coalesces concurrent refreshes into one in-flight request. Module-level
 * because a functional interceptor has no instance of its own to hold it on;
 * cleared once the call settles, so the next expired token starts a fresh one.
 */
let refreshing: Observable<boolean> | null = null;

/** The error a caller sees once the session is gone for good. */
const SESSION_EXPIRED = 'Your session has expired. Sign in again.';

/**
 * Attaches the bearer token and `x-api-key` to GraphQL calls and retries once,
 * after a single token refresh, on an unauthenticated response. Deliberately
 * scoped to the GraphQL endpoint only: the presigned-upload `PUT`s in
 * `core/api/graphql/graphql-media-repository.ts` go straight to R2/LocalStack,
 * and sending either header there would break the signature those URLs were
 * signed with.
 *
 * When the refresh cannot recover the session — no refresh token, the refresh
 * itself rejected, or the retried request still comes back unauthorised — it
 * fires {@link SessionExpiry}, which {@link AuthStore} turns into a full
 * sign-out and a redirect to `/login`.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const tokens = inject(TokenStore);
  const http = inject(HttpClient);
  const sessionExpiry = inject(SessionExpiry);

  if (!isGraphQlRequest(req)) {
    return next(req);
  }

  const isRefreshCall = req.context.get(SKIP_REFRESH);
  const bearer = isRefreshCall ? tokens.refreshToken() : tokens.accessToken();

  return send(req, next, bearer).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse) || err.status !== 401 || isRefreshCall) {
        return throwError(() => err);
      }
      return refresh(tokens, http).pipe(
        switchMap((refreshed) => {
          if (!refreshed) {
            sessionExpiry.expire();
            return throwError(() => new Error(SESSION_EXPIRED));
          }
          // The refreshed token can still be rejected (revoked, clock skew) —
          // treat a second 401 as the session being unrecoverable.
          return send(req, next, tokens.accessToken()).pipe(
            catchError((retryErr: unknown) => {
              if (retryErr instanceof HttpErrorResponse && retryErr.status === 401) {
                sessionExpiry.expire();
                return throwError(() => new Error(SESSION_EXPIRED));
              }
              return throwError(() => retryErr);
            }),
          );
        }),
      );
    }),
  );
};

/**
 * Sends `req` with `token` attached, surfacing a GraphQL auth failure — a 200
 * whose body carries an `errors` entry, not an HTTP error — as a synthetic 401
 * so the caller's `catchError` can act on it uniformly.
 */
function send(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
  token: string | null,
): Observable<HttpEvent<unknown>> {
  return next(attach(req, token)).pipe(
    tap((event) => {
      if (event instanceof HttpResponse && hasAuthError(event)) {
        throw new HttpErrorResponse({ status: 401, url: req.url });
      }
    }),
  );
}

function isGraphQlRequest(req: HttpRequest<unknown>): boolean {
  return req.url === environment.api.graphqlUrl;
}

/**
 * Adds the two headers every GraphQL call needs: the bearer token, and the
 * `x-api-key` the backend's global `ApiKeyGuard` demands even on `@Public()`
 * operations. The key comes from `environment.api.key`, which is empty in dev
 * (`proxy.conf.mjs` injects it there instead) and injected at build time for
 * production, where there is no proxy in front of the API.
 */
function attach(req: HttpRequest<unknown>, token: string | null): HttpRequest<unknown> {
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (environment.api.key) {
    headers['x-api-key'] = environment.api.key;
  }
  return Object.keys(headers).length > 0 ? req.clone({ setHeaders: headers }) : req;
}

function hasAuthError(event: HttpResponse<unknown>): boolean {
  const body = event.body as GraphQlResponseBody<unknown> | null;
  return isUnauthenticated(body?.errors ?? []);
}

/**
 * `../backend/src/auth/strategies/jwt-refresh.strategy.ts` reads the refresh
 * token off the `Authorization` header, not `input` — the resolver's `input`
 * argument is required by the schema but otherwise unused — so it must be
 * sent both ways: as `Bearer <refreshToken>` (attached above via
 * {@link SKIP_REFRESH}) and here, in `variables.input.refreshToken`.
 */
function refresh(tokens: TokenStore, http: HttpClient): Observable<boolean> {
  if (refreshing) return refreshing;

  const token = tokens.refreshToken();
  if (!token) return of(false);

  const vars: RefreshSessionMutationVariables = { input: { refreshToken: token } };
  refreshing = http
    .post<GraphQlResponseBody<RefreshSessionMutation>>(
      environment.api.graphqlUrl,
      { query: REFRESH_SESSION, variables: vars },
      { context: new HttpContext().set(SKIP_REFRESH, true) },
    )
    .pipe(
      map((body) => {
        if (!body.data || body.errors?.length) return false;
        tokens.set(body.data.session.accessToken, body.data.session.refreshToken);
        return true;
      }),
      catchError(() => of(false)),
      finalize(() => {
        refreshing = null;
      }),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
  return refreshing;
}
