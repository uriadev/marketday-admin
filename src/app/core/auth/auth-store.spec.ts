import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { AuthRepository } from '../api/ports/auth-repository';
import { InMemoryAuthRepository } from '../api/in-memory/in-memory-auth-repository';
import { AuthStore } from './auth-store';
import { SESSION_STORAGE } from './session-storage';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => map.delete(k),
    setItem: (k, v) => void map.set(k, v),
  } as Storage;
}

describe('AuthStore', () => {
  let store: AuthStore;
  let storage: Storage;

  beforeEach(() => {
    storage = memoryStorage();
    TestBed.configureTestingModule({
      providers: [
        AuthStore,
        { provide: AuthRepository, useClass: InMemoryAuthRepository },
        { provide: SESSION_STORAGE, useValue: storage },
      ],
    });
    store = TestBed.inject(AuthStore);
  });

  it('starts signed out', () => {
    expect(store.isAuthenticated()).toBe(false);
    expect(store.awaitingCode()).toBe(false);
  });

  it('rejects a short password without raising a challenge', async () => {
    await expect(firstValueFrom(store.requestCode('aine@marketday.ie', 'short'))).rejects.toThrow();
    expect(store.awaitingCode()).toBe(false);
  });

  it('raises a challenge for the fixture account, then signs in on a valid code', async () => {
    const challenge = await firstValueFrom(store.requestCode('aine@marketday.ie', 'password123'));
    expect(challenge.email).toBe('aine@marketday.ie');
    expect(store.awaitingCode()).toBe(true);

    const user = await firstValueFrom(store.verifyCode('481902'));
    expect(user.name).toBe('Áine Ryan');
    expect(store.isAuthenticated()).toBe(true);
    expect(store.awaitingCode()).toBe(false);
    expect(storage.getItem('marketday.admin.user')).toContain('Áine Ryan');
  });

  it('rejects the 000000 code', async () => {
    await firstValueFrom(store.requestCode('aine@marketday.ie', 'password123'));
    await expect(firstValueFrom(store.verifyCode('000000'))).rejects.toThrow();
    expect(store.isAuthenticated()).toBe(false);
  });

  it('signOut clears the user and storage', async () => {
    await firstValueFrom(store.requestCode('aine@marketday.ie', 'password123'));
    await firstValueFrom(store.verifyCode('481902'));
    store.signOut();
    expect(store.isAuthenticated()).toBe(false);
    expect(storage.getItem('marketday.admin.user')).toBeNull();
  });
});
