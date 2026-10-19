import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { GraphqlEventRepository } from './graphql-event-repository';
import { EventRepository } from '../ports/event-repository';
import {
  EMPTY_EVENT_FILTERS,
  EventDirectoryPage,
  EventFilters,
  EventForm,
} from '../../models/event.model';
import { environment } from '../../../../environments/environment';

const NOW = new Date('2026-09-10T14:00:00.000Z');

let repository: EventRepository;
let http: HttpTestingController;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: EventRepository, useClass: GraphqlEventRepository },
    ],
  });
  repository = TestBed.inject(EventRepository);
  http = TestBed.inject(HttpTestingController);
});

afterEach(() => {
  http.verify();
  vi.useRealTimers();
});

function expectPost(operation: string) {
  const request = http.expectOne(environment.api.graphqlUrl);
  const body = request.request.body as { query: string; variables: Record<string, unknown> };
  expect(body.query).toContain(operation);
  return { request, variables: body.variables };
}

const COUNTS = {
  everyEvent: { totalCount: 48 },
  currentEvents: { totalCount: 12 },
  draftEvents: { totalCount: 3 },
};

function list(filters: Partial<EventFilters> = {}, page = { index: 0, size: 25 }) {
  let result: EventDirectoryPage | undefined;
  repository
    .list({ filters: { ...EMPTY_EVENT_FILTERS, ...filters }, page })
    .subscribe((answer) => (result = answer));
  const { request, variables } = expectPost('query AdminEvents');
  request.flush({ data: { adminEvents: { totalCount: 0, items: [] }, ...COUNTS } });
  return { page: result!, variables };
}

describe('GraphqlEventRepository.list', () => {
  it('asks for upcoming and ongoing events by default, soonest first', () => {
    const { variables, page } = list({}, { index: 1, size: 25 });
    expect(variables).toEqual({
      now: NOW.toISOString(),
      criteria: {
        filters: [{ field: 'endsAt', operator: 'GT', value: NOW.toISOString() }],
        orderBy: 'startsAt',
        orderDir: 'ASC',
        limit: 25,
        offset: 25,
      },
    });
    expect(page.facets).toEqual({ eventCount: 48, currentCount: 12, draftCount: 3 });
  });

  it('pushes every filter down, and reads the past most recent first', () => {
    const { variables } = list({
      q: ' whileaways ',
      when: 'past',
      status: 'published',
      venueKind: 'vendor',
      category: 'farm-open-day',
    });
    expect(variables['criteria']).toEqual({
      filters: [
        { field: 'title', operator: 'CONTAINS', value: 'whileaways' },
        { field: 'endsAt', operator: 'LTE', value: NOW.toISOString() },
        { field: 'status', operator: 'EQUAL', value: 'PUBLISHED' },
        { field: 'venueKind', operator: 'EQUAL', value: 'VENDOR' },
        { field: 'category', operator: 'EQUAL', value: 'FARM_OPEN_DAY' },
      ],
      orderBy: 'startsAt',
      orderDir: 'DESC',
      limit: 25,
      offset: 0,
    });
  });

  it('puts no time bound on "any time"', () => {
    const { variables } = list({ when: 'all' });
    expect((variables['criteria'] as { filters: unknown[] }).filters).toEqual([]);
  });
});

describe('GraphqlEventRepository.form', () => {
  it('skips the event on /events/new and still reads the markets', () => {
    let form: EventForm | undefined;
    repository.form(null).subscribe((answer) => (form = answer));
    const { request, variables } = expectPost('query EventForm');
    expect(variables).toEqual({ id: '', withEvent: false });
    request.flush({ data: { adminMarkets: [] } });
    expect(form).toEqual({ event: null, markets: [] });
  });

  it('says so when the id names no event', () => {
    let error: unknown;
    repository.form('gone').subscribe({ error: (cause) => (error = cause) });
    expectPost('query EventForm').request.flush({ data: { adminEvent: null, adminMarkets: [] } });
    expect((error as Error).message).toBe('That event no longer exists.');
  });
});

describe('GraphqlEventRepository commands', () => {
  it('publishes with a one-field update', () => {
    repository.setStatus('ev-1', 'published').subscribe();
    const { variables } = expectPost('mutation UpdateEvent');
    expect(variables).toEqual({ id: 'ev-1', input: { status: 'PUBLISHED' } });
  });

  it('features with a one-field update', () => {
    repository.setFeatured('ev-1', true).subscribe();
    const { variables } = expectPost('mutation UpdateEvent');
    expect(variables).toEqual({ id: 'ev-1', input: { isFeatured: true } });
  });

  it('offers active vendors only', () => {
    repository.searchVendors('farm').subscribe();
    const { variables } = expectPost('query EventVendorOptions');
    expect(variables['criteria']).toMatchObject({
      filters: [
        { field: 'name', operator: 'CONTAINS', value: 'farm' },
        { field: 'isActive', operator: 'EQUAL', value: true },
      ],
    });
  });
});
