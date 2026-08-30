import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { delay } from 'rxjs/operators';
import { AdminProfile, AdminProfilePatch } from '../../models/admin-user.model';
import { ProfileRepository } from '../ports/profile-repository';

/**
 * The one seat that can sign in against the fixture backend, as design 1k
 * shows it. Kept in step with `in-memory-auth-repository.ts`: same person, same
 * email, same role label the drawer renders.
 */
const SEED: AdminProfile = {
  id: 'usr_aine',
  firstName: 'Áine',
  lastName: 'Ryan',
  email: 'aine@marketday.ie',
  phone: '+353 87 214 4471',
  role: 'Super admin',
  avatarUrl: null,
  passwordChanged: 'Last changed 4 months ago',
  twoFactor: true,
  twoFactorHint: 'SMS to number ending 4471',
  notifications: {
    payoutSummary: true,
    vendorApplications: true,
    marketDayReminders: false,
  },
};

@Injectable()
export class InMemoryProfileRepository extends ProfileRepository {
  /**
   * Mutable for this session, so saving and coming back shows what was written
   * rather than the seed again.
   */
  private current: AdminProfile = SEED;

  override profile(): Observable<AdminProfile> {
    return of(this.current).pipe(delay(300));
  }

  override save(patch: AdminProfilePatch): Observable<AdminProfile> {
    this.current = {
      ...this.current,
      ...patch,
      notifications: { ...patch.notifications },
      // Turning the second factor off leaves nothing to describe.
      twoFactorHint: patch.twoFactor ? this.current.twoFactorHint : 'Off',
    };
    return of(this.current).pipe(delay(400));
  }

  override sendPasswordReset(): Observable<void> {
    return of(undefined).pipe(delay(400));
  }
}
