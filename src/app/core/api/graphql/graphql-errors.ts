import { HttpErrorResponse } from '@angular/common/http';

/**
 * One entry of a GraphQL response's `errors` array, as this backend actually
 * emits it. `../backend/src/common/filters/http-exception.filter.ts` catches
 * every `HttpException` (validation failures, `ForbiddenException`,
 * `UnauthorizedException`, …) and returns it to Apollo **unmodified** — there
 * is no custom `formatError` in `../backend/src/app.module.ts`. `graphql-js`
 * only copies a thrown error's own `.extensions` onto the `GraphQLError`
 * (`node_modules/graphql/error/GraphQLError.js`), and a plain `HttpException`
 * has none, so in practice `extensions.code` normalises to Apollo's generic
 * `INTERNAL_SERVER_ERROR` for *every* thrown exception, auth failures
 * included — not `UNAUTHENTICATED`/`FORBIDDEN`/`BAD_REQUEST` as the schema's
 * shape might suggest. `code` is still checked below in case that ever
 * changes, but the reliable signal today is Nest's own default exception
 * message, confirmed by reading the guards that throw them:
 *   - `JwtAuthGuard` / `JwtRefreshGuard` on a missing/invalid/expired token →
 *     `UnauthorizedException()` → message **"Unauthorized"**.
 *   - `RolesGuard` returning `false` → Nest's own `ForbiddenException` →
 *     message **"Forbidden resource"**.
 * Reconfirm both against a running backend (plan's verification step 4, the
 * forced-401 check) and adjust the string matches below if they differ.
 */
export interface GraphQlErrorShape {
  readonly message: string;
  readonly path?: readonly (string | number)[];
  readonly extensions?: {
    readonly code?: string;
    /** The raw Nest `HttpException.getResponse()` body, when it's an object. */
    readonly originalError?: {
      readonly statusCode?: number;
      readonly message?: string | readonly string[];
      readonly error?: string;
    };
  };
}

export interface GraphQlResponseBody<T> {
  readonly data?: T;
  readonly errors?: readonly GraphQlErrorShape[];
}

const AUTH_CODES = new Set(['UNAUTHENTICATED', 'UNAUTHORIZED']);
const FORBIDDEN_CODES = new Set(['FORBIDDEN']);

/** True when the caller's token is missing, invalid, or expired. */
export function isUnauthenticated(errors: readonly GraphQlErrorShape[]): boolean {
  return errors.some(
    (error) => AUTH_CODES.has(error.extensions?.code ?? '') || error.message === 'Unauthorized',
  );
}

/** The human sentence a fixture repository would have rejected with. */
function humanize(error: GraphQlErrorShape): string {
  if (FORBIDDEN_CODES.has(error.extensions?.code ?? '') || error.message === 'Forbidden resource') {
    return 'You do not have permission to do that.';
  }
  const original = error.extensions?.originalError?.message;
  if (Array.isArray(original) && original.length > 0) return original.join(' ');
  if (typeof original === 'string' && original.length > 0) return original;
  return error.message;
}

/** Turns a populated `errors` array into the one `Error` a facade expects. */
export function toDomainError(errors: readonly GraphQlErrorShape[]): Error {
  return new Error(errors.map(humanize).join(' '));
}

/**
 * Maps an `HttpErrorResponse` — a non-2xx reply, or the request never reaching
 * the server at all — to the same domain `Error` shape. A GraphQL business
 * error normally arrives inside a 200 response's `errors` array (handled by
 * {@link toDomainError} instead); this only fires for transport failures.
 */
export function mapHttpError(err: HttpErrorResponse): Error {
  if (err.status === 0) {
    return new Error('Could not reach the server.');
  }
  const body = err.error as GraphQlResponseBody<unknown> | undefined;
  if (body?.errors?.length) {
    return toDomainError(body.errors);
  }
  return new Error('Something went wrong. Try again.');
}
