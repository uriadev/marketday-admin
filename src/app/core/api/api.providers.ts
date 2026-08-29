import { Provider } from '@angular/core';
import { AuthRepository } from './ports/auth-repository';
import { DashboardRepository } from './ports/dashboard-repository';
import { InMemoryAuthRepository } from './in-memory/in-memory-auth-repository';
import { InMemoryDashboardRepository } from './in-memory/in-memory-dashboard-repository';

/**
 * Binds every repository port to its implementation. Today that is the in-memory
 * fixture backend; swapping to GraphQL (see `../../../../docs/ARCHITECTURE.md` §8)
 * is a change to the `useClass` lines here and nothing above `core/`.
 */
export const API_PROVIDERS: Provider[] = [
  { provide: AuthRepository, useClass: InMemoryAuthRepository },
  { provide: DashboardRepository, useClass: InMemoryDashboardRepository },
];
