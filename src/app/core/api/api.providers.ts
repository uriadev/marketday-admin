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
import { InMemoryAuthRepository } from './in-memory/in-memory-auth-repository';
import { InMemoryDashboardRepository } from './in-memory/in-memory-dashboard-repository';
import { InMemoryMarketRepository } from './in-memory/in-memory-market-repository';
import { InMemoryVendorRepository } from './in-memory/in-memory-vendor-repository';
import { InMemoryMediaRepository } from './in-memory/in-memory-media-repository';
import { InMemoryPaymentRepository } from './in-memory/in-memory-payment-repository';
import { InMemoryProductRepository } from './in-memory/in-memory-product-repository';
import { InMemoryProfileRepository } from './in-memory/in-memory-profile-repository';
import { InMemorySupportRepository } from './in-memory/in-memory-support-repository';

/**
 * Binds every repository port to its implementation. Today that is the in-memory
 * fixture backend; swapping to GraphQL (see `../../../../docs/ARCHITECTURE.md` §8)
 * is a change to the `useClass` lines here and nothing above `core/`.
 */
export const API_PROVIDERS: Provider[] = [
  { provide: AccountRepository, useClass: InMemoryAccountRepository },
  { provide: ActivityRepository, useClass: InMemoryActivityRepository },
  { provide: AuthRepository, useClass: InMemoryAuthRepository },
  { provide: DashboardRepository, useClass: InMemoryDashboardRepository },
  { provide: MarketRepository, useClass: InMemoryMarketRepository },
  { provide: VendorRepository, useClass: InMemoryVendorRepository },
  { provide: MediaRepository, useClass: InMemoryMediaRepository },
  { provide: PaymentRepository, useClass: InMemoryPaymentRepository },
  { provide: ProductRepository, useClass: InMemoryProductRepository },
  { provide: ProfileRepository, useClass: InMemoryProfileRepository },
  { provide: SupportRepository, useClass: InMemorySupportRepository },
];
