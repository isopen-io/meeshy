import { describe, expect, test } from 'bun:test';

import { createSessionStore, type SessionStorage } from './session';

/**
 * LE MAGASIN DE SESSION (#5605, T3) — `zustand/vanilla`, motif
 * `conversation-store.ts:26-32` : `createStore` rend le magasin observable
 * HORS de tout composant, exactement ce qu'un témoin exploite ici.
 *
 * `storage` ET `now` INJECTABLES (motif `scheme.test.ts`) : pas de DOM, un
 * `Map` en mémoire, et une horloge FIGÉE — l'échéance d'une session est une
 * comparaison à `Date.now()`, donc un témoin qui la laisserait courir
 * mesurerait la machine, pas la règle.
 */

/** Horloge figée — la doctrine des captures du README, portée aux témoins. */
const FIXED_NOW = Date.UTC(2026, 8, 7, 12, 0, 0);

function fakeStorage(seed: Readonly<Record<string, string>> = {}): SessionStorage & { readonly raw: Map<string, string> } {
  const raw = new Map(Object.entries(seed));
  return {
    raw,
    getItem: (key) => raw.get(key) ?? null,
    setItem: (key, value) => {
      raw.set(key, value);
    },
    removeItem: (key) => {
      raw.delete(key);
    },
  };
}

describe('createSessionStore — état initial', () => {
  test('anonymous, aucun jeton', () => {
    const store = createSessionStore({ storage: fakeStorage(), now: () => FIXED_NOW });
    expect(store.getState().session).toEqual({ status: 'anonymous' });
  });
});

describe('createSessionStore — establish()', () => {
  test('⇒ authenticated ET écrit `meeshy.session` dans le storage', () => {
    const storage = fakeStorage();
    const store = createSessionStore({ storage, now: () => FIXED_NOW });

    store.getState().establish({
      user: { id: 'u-1', username: 'ada', displayName: 'Ada' },
      token: 'jwt-1',
      sessionToken: 'sess-1',
      expiresIn: 86_400,
    });

    expect(store.getState().session).toEqual({
      status: 'authenticated',
      user: { id: 'u-1', username: 'ada', displayName: 'Ada' },
      token: 'jwt-1',
      sessionToken: 'sess-1',
      expiresAt: FIXED_NOW + 86_400_000,
    });
    const persisted = JSON.parse(storage.raw.get('meeshy.session')!);
    expect(persisted).toEqual({
      token: 'jwt-1',
      sessionToken: 'sess-1',
      user: { id: 'u-1', username: 'ada', displayName: 'Ada' },
      expiresAt: FIXED_NOW + 86_400_000,
    });
  });
});

describe('createSessionStore — restoreSession()', () => {
  test('storage pré-rempli ⇒ authenticated avec les MÊMES jetons — la session est tenue', () => {
    const storage = fakeStorage({
      'meeshy.session': JSON.stringify({
        token: 'jwt-2',
        sessionToken: 'sess-2',
        user: { id: 'u-2', username: 'bo' },
        expiresAt: FIXED_NOW + 86_400_000,
      }),
    });
    const store = createSessionStore({ storage, now: () => FIXED_NOW });

    store.getState().restoreSession();

    expect(store.getState().session).toEqual({
      status: 'authenticated',
      user: { id: 'u-2', username: 'bo' },
      token: 'jwt-2',
      sessionToken: 'sess-2',
      expiresAt: FIXED_NOW + 86_400_000,
    });
  });

  test('rien en storage ⇒ reste anonymous', () => {
    const store = createSessionStore({ storage: fakeStorage(), now: () => FIXED_NOW });
    store.getState().restoreSession();
    expect(store.getState().session).toEqual({ status: 'anonymous' });
  });

  test('JSON invalide ⇒ anonymous, PAS d’exception, l’entrée est purgée', () => {
    const storage = fakeStorage({ 'meeshy.session': '{ pas du json' });
    const store = createSessionStore({ storage, now: () => FIXED_NOW });

    expect(() => store.getState().restoreSession()).not.toThrow();

    expect(store.getState().session).toEqual({ status: 'anonymous' });
    expect(storage.raw.has('meeshy.session')).toBe(false);
  });

  test('champs manquants (pas de sessionToken) ⇒ anonymous, purgé — fail-closed', () => {
    const storage = fakeStorage({
      'meeshy.session': JSON.stringify({
        token: 'jwt-3',
        user: { id: 'u-3', username: 'c' },
        expiresAt: FIXED_NOW + 1_000,
      }),
    });
    const store = createSessionStore({ storage, now: () => FIXED_NOW });

    store.getState().restoreSession();

    expect(store.getState().session).toEqual({ status: 'anonymous' });
    expect(storage.raw.has('meeshy.session')).toBe(false);
  });
});

/**
 * CE QUI PART À CÔTÉ DU JETON (doctrine cycle 125 du CLAUDE.md racine) — la
 * charge SERVIE par `login.ts:206` est `formatUserResponse(user, permissions)`
 * (`routes/auth/types.ts:131-165`), soit VINGT-SEPT champs : `email`,
 * `phoneNumber`, `role`, `lastLoginIp`, `lastLoginLocation`,
 * `lastLoginDevice`, `permissions`… Le TYPE `SessionUser` en déclare quatre,
 * mais TypeScript est STRUCTUREL : il ne retire rien à l'exécution. Sans
 * projection, `localStorage` garde durablement, sur la machine du lecteur,
 * son adresse IP et la géolocalisation de sa dernière connexion.
 */
const SERVED_USER = {
  id: 'u-9',
  username: 'ada',
  displayName: 'Ada',
  avatar: 'https://cdn.example/a.png',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.io',
  phoneNumber: '+33600000000',
  role: 'USER',
  lastLoginIp: '203.0.113.7',
  lastLoginLocation: 'Paris, FR',
  lastLoginDevice: 'Chrome / macOS',
  permissions: { canAccessAdmin: false },
};

describe('createSessionStore — la projection de l’utilisateur', () => {
  test('establish() ne retient NI ne persiste rien d’autre que les quatre champs déclarés', () => {
    const storage = fakeStorage();
    const store = createSessionStore({ storage, now: () => FIXED_NOW });

    store.getState().establish({ user: SERVED_USER, token: 'jwt', sessionToken: 'sess', expiresIn: 86400 });

    const session = store.getState().session;
    if (session.status !== 'authenticated') throw new Error('unreachable');
    expect(Object.keys(session.user).sort()).toEqual(['avatar', 'displayName', 'id', 'username']);

    const persisted = JSON.parse(storage.raw.get('meeshy.session')!) as { user: Record<string, unknown> };
    expect(Object.keys(persisted.user).sort()).toEqual(['avatar', 'displayName', 'id', 'username']);
    expect(storage.raw.get('meeshy.session')).not.toContain('203.0.113.7');
    expect(storage.raw.get('meeshy.session')).not.toContain('ada@example.io');
  });

  test('beginTwoFactor() ne retient que les sept champs de login.ts:145-158', () => {
    const store = createSessionStore({ storage: fakeStorage(), now: () => FIXED_NOW });

    store.getState().beginTwoFactor({ user: SERVED_USER, twoFactorToken: 'tok' });

    const session = store.getState().session;
    if (session.status !== 'pending2fa') throw new Error('unreachable');
    expect(Object.keys(session.user).sort()).toEqual([
      'avatar',
      'displayName',
      'email',
      'firstName',
      'id',
      'lastName',
      'username',
    ]);
    expect(Object.keys(session.user)).not.toContain('lastLoginIp');
  });
});

/**
 * F6 (#5650) — le Prisme du lecteur vient de la SESSION en source `gateway` :
 * `SessionUser` gagne les trois rangs servis par `formatUserResponse`
 * (`services/gateway/src/routes/auth/types.ts:146-148`).
 */
describe('createSessionStore — F6, les trois langues du Prisme', () => {
  test('establish() projette les trois langues et jamais email', () => {
    const storage = fakeStorage();
    const store = createSessionStore({ storage, now: () => FIXED_NOW });

    store.getState().establish({
      user: {
        ...SERVED_USER,
        systemLanguage: 'en',
        regionalLanguage: 'fr',
        customDestinationLanguage: null,
      },
      token: 'jwt',
      sessionToken: 'sess',
      expiresIn: 86400,
    });

    const session = store.getState().session;
    if (session.status !== 'authenticated') throw new Error('unreachable');
    expect(session.user.systemLanguage).toBe('en');
    expect(session.user.regionalLanguage).toBe('fr');
    expect(session.user.customDestinationLanguage).toBeNull();
    expect('email' in session.user).toBe(false);
  });

  test('une entrée persistée SANS langues (forme d’avant ce lot) se restaure encore', () => {
    const storage = fakeStorage({
      'meeshy.session': JSON.stringify({
        token: 'jwt-old',
        sessionToken: 'sess-old',
        user: { id: 'u-old', username: 'old' },
        expiresAt: FIXED_NOW + 86_400_000,
      }),
    });
    const store = createSessionStore({ storage, now: () => FIXED_NOW });

    store.getState().restoreSession();

    expect(store.getState().session).toEqual({
      status: 'authenticated',
      user: { id: 'u-old', username: 'old' },
      token: 'jwt-old',
      sessionToken: 'sess-old',
      expiresAt: FIXED_NOW + 86_400_000,
    });
  });
});

/**
 * « LA SESSION EST TENUE » ne peut pas vouloir dire « une session PÉRIMÉE est
 * présentée comme tenue » : le jeton servi porte sa durée (`expiresIn`,
 * `login.ts:211` — 24 h, ou 365 j sous `rememberDevice`), et un JWT expiré
 * fait 401 sur le PREMIER appel. Restaurer un écran authentifié pour le
 * défaire aussitôt est un état de plus, pas une session tenue.
 */
describe('createSessionStore — l’expiration', () => {
  test('une session encore valide est restaurée', () => {
    const storage = fakeStorage({
      'meeshy.session': JSON.stringify({
        token: 'jwt-4',
        sessionToken: 'sess-4',
        user: { id: 'u-4', username: 'dd' },
        expiresAt: FIXED_NOW + 1_000,
      }),
    });
    const store = createSessionStore({ storage, now: () => FIXED_NOW });

    store.getState().restoreSession();

    expect(store.getState().session.status).toBe('authenticated');
  });

  test('une session PÉRIMÉE ⇒ anonymous et purgée — jamais un écran authentifié qui se défait au premier appel', () => {
    const storage = fakeStorage({
      'meeshy.session': JSON.stringify({
        token: 'jwt-5',
        sessionToken: 'sess-5',
        user: { id: 'u-5', username: 'ee' },
        expiresAt: FIXED_NOW - 1,
      }),
    });
    const store = createSessionStore({ storage, now: () => FIXED_NOW });

    store.getState().restoreSession();

    expect(store.getState().session).toEqual({ status: 'anonymous' });
    expect(storage.raw.has('meeshy.session')).toBe(false);
  });

  test('une entrée SANS échéance est corrompue — fail-closed, jamais « valide pour toujours »', () => {
    const storage = fakeStorage({
      'meeshy.session': JSON.stringify({
        token: 'jwt-6',
        sessionToken: 'sess-6',
        user: { id: 'u-6', username: 'ff' },
      }),
    });
    const store = createSessionStore({ storage, now: () => FIXED_NOW });

    store.getState().restoreSession();

    expect(store.getState().session).toEqual({ status: 'anonymous' });
    expect(storage.raw.has('meeshy.session')).toBe(false);
  });
});

describe('createSessionStore — clearSession() (miroir SessionSnapshotStore.wipe())', () => {
  test('⇒ anonymous, clé retirée du storage', () => {
    const storage = fakeStorage();
    const store = createSessionStore({ storage, now: () => FIXED_NOW });
    store
      .getState()
      .establish({ user: { id: 'u-1', username: 'ada' }, token: 't', sessionToken: 's', expiresIn: 86_400 });

    store.getState().clearSession();

    expect(store.getState().session).toEqual({ status: 'anonymous' });
    expect(storage.raw.has('meeshy.session')).toBe(false);
  });

  test('idempotent : deux appels rendent le même état', () => {
    const store = createSessionStore({ storage: fakeStorage(), now: () => FIXED_NOW });
    store.getState().clearSession();
    store.getState().clearSession();
    expect(store.getState().session).toEqual({ status: 'anonymous' });
  });
});
