import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { GraphqlPromotionRepository } from './graphql-promotion-repository';
import { PromotionRepository } from '../ports/promotion-repository';
import {
  EMPTY_PROMOTION_FILTERS,
  LatLng,
  PromotionDirectoryPage,
  PromotionFilters,
  PromotionForm,
} from '../../models/promotion.model';
import { environment } from '../../../../environments/environment';

let repository: PromotionRepository;
let http: HttpTestingController;

beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: PromotionRepository, useClass: GraphqlPromotionRepository },
    ],
  });
  repository = TestBed.inject(PromotionRepository);
  http = TestBed.inject(HttpTestingController);
});

afterEach(() => http.verify());

function expectPost(operation: string) {
  const request = http.expectOne(environment.api.graphqlUrl);
  const body = request.request.body as { query: string; variables: Record<string, unknown> };
  expect(body.query).toContain(operation);
  return { request, variables: body.variables };
}

const COUNTS = {
  everyPromotion: { totalCount: 14 },
  draftPromotions: { totalCount: 3 },
  scheduledPromotions: { totalCount: 9 },
  pausedPromotions: { totalCount: 2 },
};

function list(filters: Partial<PromotionFilters> = {}) {
  let result: PromotionDirectoryPage | undefined;
  repository
    .list({ filters: { ...EMPTY_PROMOTION_FILTERS, ...filters }, page: { index: 0, size: 25 } })
    .subscribe((answer) => (result = answer));
  const { request, variables } = expectPost('query AdminPromotions');
  request.flush({ data: { adminPromotions: { totalCount: 0, items: [] }, ...COUNTS } });
  return { page: result!, variables };
}

describe('GraphqlPromotionRepository.list', () => {
  it('asks for the page with no filters, and reads the per-status counts', () => {
    const { variables, page } = list();
    expect(variables).toEqual({ criteria: { filters: [], limit: 25, offset: 0 } });
    expect(page.facets).toEqual({
      promotionCount: 14,
      statusCounts: { draft: 3, scheduled: 9, paused: 2 },
    });
  });

  it('pushes every filter down', () => {
    const { variables } = list({
      q: ' bakery ',
      placement: 'market-page',
      status: 'paused',
      targetKind: 'product',
      sponsor: 'house',
    });
    expect((variables['criteria'] as { filters: unknown[] }).filters).toEqual([
      { field: 'sponsorName', operator: 'CONTAINS', value: 'bakery' },
      { field: 'placement', operator: 'EQUAL', value: 'MARKET_PAGE' },
      { field: 'status', operator: 'EQUAL', value: 'PAUSED' },
      { field: 'targetKind', operator: 'EQUAL', value: 'PRODUCT' },
      { field: 'isHouse', operator: 'EQUAL', value: true },
    ]);
  });
});

describe('GraphqlPromotionRepository.form', () => {
  it('resolves a "Promote this event" link to its subject', () => {
    let form: PromotionForm | undefined;
    repository.form(null, { kind: 'event', id: 'ev-1' }).subscribe((answer) => (form = answer));
    expectPost('query PromotionForm').request.flush({ data: { adminMarkets: [] } });
    expectPost('query PromotionPrefillEvent').request.flush({
      data: { adminEvent: { id: 'ev-1', title: 'Feast Fest', imageUrl: null } },
    });
    expect(form?.prefilled).toMatchObject({ kind: 'event', id: 'ev-1', name: 'Feast Fest' });
  });

  it('still opens the form when the prefill link is stale', () => {
    let form: PromotionForm | undefined;
    repository.form(null, { kind: 'vendor', id: 'gone' }).subscribe((answer) => (form = answer));
    expectPost('query PromotionForm').request.flush({ data: { adminMarkets: [] } });
    expectPost('query PromotionPrefillVendor').request.flush({ data: { vendor: null } });
    expect(form).toEqual({ promotion: null, markets: [], prefilled: null });
  });
});

describe('GraphqlPromotionRepository commands', () => {
  it('pauses through its own mutation', () => {
    repository.setStatus('pr-1', 'paused').subscribe();
    const { variables } = expectPost('mutation SetPromotionStatus');
    expect(variables).toEqual({ id: 'pr-1', status: 'PAUSED' });
  });

  it('centres a vendor’s reach on its public markets, leaving out its truck stops', () => {
    let point: LatLng | null | undefined;
    repository.suggestedReach('vendor', 'vd-1').subscribe((answer) => (point = answer));
    expectPost('query PromotionVendorPoints').request.flush({
      data: {
        vendor: {
          markets: [
            { kind: 'PUBLIC_MARKET', location: { type: 'Point', coordinates: [-8, 52] } },
            { kind: 'PUBLIC_MARKET', location: { type: 'Point', coordinates: [-6, 54] } },
            { kind: 'FOOD_TRUCK_STOP', location: { type: 'Point', coordinates: [0, 0] } },
          ],
        },
      },
    });
    expect(point).toEqual({ latitude: 53, longitude: -7 });
  });
});
