import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';
import { AuthStore } from './auth-store';

/** Console routes: require a signed-in user, otherwise send to `/login`. */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthStore);
  return auth.isAuthenticated() ? true : inject(Router).parseUrl('/login');
};

/** Auth routes: a signed-in user has no business here — send them to the console. */
export const guestGuard: CanActivateChildFn = () => {
  const auth = inject(AuthStore);
  return auth.isAuthenticated() ? inject(Router).parseUrl('/') : true;
};

/** `/login/verify`: only reachable once `/login` has produced a challenge. */
export const codeChallengeGuard: CanActivateFn = () => {
  const auth = inject(AuthStore);
  return auth.awaitingCode() ? true : inject(Router).parseUrl('/login');
};
