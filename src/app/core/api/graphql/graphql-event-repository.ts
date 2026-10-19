import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { EventRepository } from '../ports/event-repository';
import {
  EventDirectoryPage,
  EventDraft,
  EventFilters,
  EventForm,
  EventListQuery,
  EventRecord,
  EventStatus,
} from '../../models/event.model';
import { PickerOption } from '../../models/picker-option.model';
import { GraphqlClient } from './graphql-client';
import {
  ADMIN_EVENTS,
  CREATE_EVENT,
  DELETE_EVENT,
  EVENT_FORM,
  EVENT_VENDOR_OPTIONS,
  UPDATE_EVENT,
} from './operations/event';
import {
  GQL_CATEGORY,
  GQL_EVENT_STATUS,
  GQL_VENUE_KIND,
  toCreateEventInput,
  toEventMarketOption,
  toEventRecord,
  toUpdateEventInput,
} from './mappers/event-mapper';
import {
  AdminEventsQuery,
  AdminEventsQueryVariables,
  CreateEventMutation,
  CreateEventMutationVariables,
  DeleteEventMutation,
  DeleteEventMutationVariables,
  EventFormQuery,
  EventFormQueryVariables,
  EventVendorOptionsQuery,
  EventVendorOptionsQueryVariables,
  FilterInput,
  FilterOperator,
  OrderDirection,
  UpdateEventInput,
  UpdateEventMutation,
  UpdateEventMutationVariables,
} from './generated';

/** Enough to pick from without scrolling a panel to its limit. */
const PICKER_LIMIT = 20;

function criteriaFilters(filters: EventFilters, now: string): FilterInput[] {
  const pushed: FilterInput[] = [];
  const needle = filters.q.trim();
  if (needle) pushed.push({ field: 'title', operator: FilterOperator.Contains, value: needle });
  if (filters.when === 'current') {
    pushed.push({ field: 'endsAt', operator: FilterOperator.Gt, value: now });
  } else if (filters.when === 'past') {
    pushed.push({ field: 'endsAt', operator: FilterOperator.Lte, value: now });
  }
  if (filters.status) {
    pushed.push({
      field: 'status',
      operator: FilterOperator.Equal,
      value: GQL_EVENT_STATUS[filters.status],
    });
  }
  if (filters.venueKind) {
    pushed.push({
      field: 'venueKind',
      operator: FilterOperator.Equal,
      value: GQL_VENUE_KIND[filters.venueKind],
    });
  }
  if (filters.category) {
    pushed.push({
      field: 'category',
      operator: FilterOperator.Equal,
      value: GQL_CATEGORY[filters.category],
    });
  }
  return pushed;
}

/**
 * Events against the What's On context's admin surface — `adminEvents`,
 * `adminEvent`, `createEvent`, `updateEvent`, `deleteEvent`, all
 * `@Roles(ADMIN)`. Nothing here has a fixture: the backend covers every
 * operation the screens need.
 *
 * `list()` pages **server-side** and pushes every filter down as a
 * `CriteriaInput` filter (`title` CONTAINS, `endsAt` against the client's
 * clock, `status`, `venueKind`, `category`). Upcoming events read soonest
 * first; past ones most recent first, which is the order someone looking back
 * wants. The header's counts ride in the same document as aliases.
 *
 * Two wire rules the mapper encodes, both found in the backend's
 * `CalendarEvent`: a market event's coordinates are *omitted*, never `null`,
 * and `areaName` on an update is never `null`.
 */
@Injectable()
export class GraphqlEventRepository extends EventRepository {
  private readonly client = inject(GraphqlClient);

  override list(query: EventListQuery): Observable<EventDirectoryPage> {
    const { filters, page } = query;
    const now = new Date();
    const nowIso = now.toISOString();
    const variables: AdminEventsQueryVariables = {
      now: nowIso,
      criteria: {
        filters: criteriaFilters(filters, nowIso),
        orderBy: 'startsAt',
        orderDir: filters.when === 'past' ? OrderDirection.Desc : OrderDirection.Asc,
        limit: page.size,
        offset: page.index * page.size,
      },
    };
    return this.client
      .request<AdminEventsQuery, AdminEventsQueryVariables>(ADMIN_EVENTS, variables)
      .pipe(
        map((result) => ({
          items: result.adminEvents.items.map((event) => toEventRecord(event, now)),
          total: result.adminEvents.totalCount,
          facets: {
            eventCount: result.everyEvent.totalCount,
            currentCount: result.currentEvents.totalCount,
            draftCount: result.draftEvents.totalCount,
          },
        })),
      );
  }

  override form(id: string | null): Observable<EventForm> {
    return this.client
      .request<EventFormQuery, EventFormQueryVariables>(EVENT_FORM, {
        // `@include(if: false)` skips the field; the id still has to be an ID.
        id: id ?? '',
        withEvent: id !== null,
      })
      .pipe(
        map((result) => {
          if (id !== null && !result.adminEvent) {
            throw new Error('That event no longer exists.');
          }
          return {
            event: result.adminEvent ? toEventRecord(result.adminEvent) : null,
            markets: result.adminMarkets.map(toEventMarketOption),
          };
        }),
      );
  }

  override create(draft: EventDraft): Observable<EventRecord> {
    return this.client
      .request<CreateEventMutation, CreateEventMutationVariables>(CREATE_EVENT, {
        input: toCreateEventInput(draft),
      })
      .pipe(map((result) => toEventRecord(result.createEvent)));
  }

  override update(id: string, draft: EventDraft): Observable<EventRecord> {
    return this.patch(id, toUpdateEventInput(draft));
  }

  override setStatus(id: string, status: EventStatus): Observable<EventRecord> {
    return this.patch(id, { status: GQL_EVENT_STATUS[status] });
  }

  override setFeatured(id: string, featured: boolean): Observable<EventRecord> {
    return this.patch(id, { isFeatured: featured });
  }

  override remove(id: string): Observable<void> {
    return this.client
      .request<DeleteEventMutation, DeleteEventMutationVariables>(DELETE_EVENT, { id })
      .pipe(
        map((result) => {
          if (!result.deleteEvent) throw new Error("That event wasn't deleted. Try again.");
        }),
      );
  }

  /**
   * Active vendors only: the backend refuses a new vendor event at an
   * inactive one, so offering it would only lead to that refusal. An empty
   * query lists the first few alphabetically, so the panel is never blank.
   */
  override searchVendors(query: string): Observable<readonly PickerOption[]> {
    const needle = query.trim();
    return this.client
      .request<EventVendorOptionsQuery, EventVendorOptionsQueryVariables>(EVENT_VENDOR_OPTIONS, {
        criteria: {
          filters: [
            ...(needle ? [{ field: 'name', operator: FilterOperator.Contains, value: needle }] : []),
            { field: 'isActive', operator: FilterOperator.Equal, value: true },
          ],
          orderBy: 'name',
          orderDir: OrderDirection.Asc,
          limit: PICKER_LIMIT,
        },
      })
      .pipe(
        map((result) =>
          result.adminVendors.items.map((vendor) => ({
            id: vendor.id,
            label: vendor.name,
            detail: vendor.category,
          })),
        ),
      );
  }

  /** A one-field change goes through `updateEvent` like any other edit. */
  private patch(id: string, input: UpdateEventInput): Observable<EventRecord> {
    return this.client
      .request<UpdateEventMutation, UpdateEventMutationVariables>(UPDATE_EVENT, { id, input })
      .pipe(map((result) => toEventRecord(result.updateEvent)));
  }
}
