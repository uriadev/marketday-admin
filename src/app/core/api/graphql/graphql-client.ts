import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { GraphQlResponseBody, mapHttpError, toDomainError } from './graphql-errors';

/**
 * The one place a GraphQL request leaves the app. No cache, no normalization —
 * `CollectionStore` and each feature facade already own their slice of state,
 * so an Apollo-style cache would just duplicate it and fight the signals model
 * (`../../../../../docs/ARCHITECTURE.md` §4). One method, one job: post a
 * document, unwrap `data`, and turn anything else into the plain `Error` every
 * facade already knows how to render (`cause instanceof Error ? cause.message
 * : …`) — the same contract the `InMemory*Repository` fixtures use.
 *
 * `Authorization` and `x-api-key` are attached by {@link authInterceptor}, not
 * here — this client only knows GraphQL.
 */
@Injectable({ providedIn: 'root' })
export class GraphqlClient {
  private readonly http = inject(HttpClient);

  request<TData, TVariables extends object = Record<string, never>>(
    document: string,
    variables?: TVariables,
  ): Observable<TData> {
    return this.http
      .post<GraphQlResponseBody<TData>>(environment.api.graphqlUrl, { query: document, variables })
      .pipe(
        map((response) => unwrap(response)),
        catchError((err: unknown) => {
          throw err instanceof HttpErrorResponse ? mapHttpError(err) : err;
        }),
      );
  }
}

function unwrap<T>(response: GraphQlResponseBody<T>): T {
  if (response.errors?.length) {
    throw toDomainError(response.errors);
  }
  if (response.data === undefined) {
    throw new Error('The server returned an empty response.');
  }
  return response.data;
}
