import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { GraphqlProfileRepository } from './graphql-profile-repository';
import { ProfileRepository } from '../ports/profile-repository';
import { AdminProfilePatch } from '../../models/admin-user.model';
import { environment } from '../../../../environments/environment';

const ME = {
  id: 'usr-1',
  fullName: 'Aine Byrne',
  email: 'aine@marketday.ie',
  phone: null,
  avatarUrl: null,
  role: 'ADMIN',
  hasPassword: true,
};

function patch(overrides: Partial<AdminProfilePatch> = {}): AdminProfilePatch {
  return {
    firstName: 'Aine',
    lastName: 'Byrne',
    phone: '+353 87 000 0000',
    avatarUrl: 'https://cdn.marketday.ie/avatars/aine.jpg',
    twoFactor: false,
    notifications: { payoutSummary: true, vendorApplications: true, marketDayReminders: true },
    ...overrides,
  };
}

let repository: ProfileRepository;
let http: HttpTestingController;

beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: ProfileRepository, useClass: GraphqlProfileRepository },
    ],
  });
  repository = TestBed.inject(ProfileRepository);
  http = TestBed.inject(HttpTestingController);
});

afterEach(() => http.verify());

/** The `updateMe` input the repository posted. */
function saveAndCapture(overrides: Partial<AdminProfilePatch>): Record<string, unknown> {
  repository.save(patch(overrides)).subscribe();
  const request = http.expectOne(environment.api.graphqlUrl);
  const body = request.request.body as {
    query: string;
    variables: { input: Record<string, unknown> };
  };
  expect(body.query).toContain('mutation UpdateMe');
  request.flush({ data: { updateMe: ME } });
  return body.variables.input;
}

describe('GraphqlProfileRepository.save', () => {
  it('sends the name, phone and photo it was given', () => {
    expect(saveAndCapture({})).toEqual({
      fullName: 'Aine Byrne',
      phone: '+353 87 000 0000',
      avatarUrl: 'https://cdn.marketday.ie/avatars/aine.jpg',
    });
  });

  it('sends an emptied phone number and a removed photo as explicit nulls', () => {
    // Omitting either would read as "leave it alone" and keep what the admin
    // just cleared; `''` would be stored as a blank phone number.
    const input = saveAndCapture({ phone: '', avatarUrl: null });

    expect(input).toHaveProperty('phone', null);
    expect(input).toHaveProperty('avatarUrl', null);
  });
});
