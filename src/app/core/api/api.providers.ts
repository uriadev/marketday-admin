import { Provider } from '@angular/core';
import { AccountRepository } from './ports/account-repository';
import { ActivityRepository } from './ports/activity-repository';
import { AuthRepository } from './ports/auth-repository';
import { DashboardRepository } from './ports/dashboard-repository';
import { MarketRepository } from './ports/market-repository';
import { VendorRepository } from './ports/vendor-repository';
import { MediaRepository } from './ports/media-repository';
import { PaymentRepository } from './ports/payment-repository';
import { ProductRepository } from './ports/product-repository';
import { ProfileRepository } from './ports/profile-repository';
import { SupportRepository } from './ports/support-repository';
import { InMemoryAccountRepository } from './in-memory/in-memory-account-repository';
import { InMemoryActivityRepository } from './in-memory/in-memory-activity-repository';
import { InMemoryDashboardRepository } from './in-memory/in-memory-dashboard-repository';
import { InMemoryPaymentRepository } from './in-memory/in-memory-payment-repository';
import { InMemorySupportRepository } from './in-memory/in-memory-support-repository';
import { GraphqlAuthRepository } from './graphql/graphql-auth-repository';
import { GraphqlMarketRepository } from './graphql/graphql-market-repository';
import { GraphqlMediaRepository } from './graphql/graphql-media-repository';
import { GraphqlProductRepository } from './graphql/graphql-product-repository';
import { GraphqlProfileRepository } from './graphql/graphql-profile-repository';
import { GraphqlVendorRepository } from './graphql/graphql-vendor-repository';

/**
 * Binds every repository port to its implementation. `../../../../docs/ARCHITECTURE.md`
 * §8 describes the swap as a change to these `useClass` lines and nothing above
 * `core/` — in practice it is a **hybrid**: `schema.gql` covers Auth, Markets,
 * Profile, Media, Vendors and Products, so those six are wired to
 * `core/api/graphql/`. `adminVendors` closed `docs/backend-api-gaps.md` #2 and
 * a `slug` field closed #10; the vendor *write* paths still have no admin
 * endpoint (`GraphqlVendorRepository` documents which and why). Products' write
 * mutations were widened to `@Roles(VENDOR, ADMIN)` server-side (#7), so
 * `GraphqlProductRepository` runs the grid and the form end-to-end; only
 * `deleteProduct` is still missing (#8). The remaining five ports have no
 * admin-facing backend surface yet — see `docs/backend-api-gaps.md` — and stay
 * on their `InMemory*Repository` fixture until they do.
 */
export const API_PROVIDERS: Provider[] = [
  { provide: AccountRepository, useClass: InMemoryAccountRepository },
  { provide: ActivityRepository, useClass: InMemoryActivityRepository },
  { provide: AuthRepository, useClass: GraphqlAuthRepository },
  { provide: DashboardRepository, useClass: InMemoryDashboardRepository },
  { provide: MarketRepository, useClass: GraphqlMarketRepository },
  { provide: VendorRepository, useClass: GraphqlVendorRepository },
  { provide: MediaRepository, useClass: GraphqlMediaRepository },
  { provide: PaymentRepository, useClass: InMemoryPaymentRepository },
  { provide: ProductRepository, useClass: GraphqlProductRepository },
  { provide: ProfileRepository, useClass: GraphqlProfileRepository },
  { provide: SupportRepository, useClass: InMemorySupportRepository },
];
