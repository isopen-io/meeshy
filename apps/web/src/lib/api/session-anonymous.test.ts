import { describe, expect, test } from 'bun:test';

import { createSessionStore, heldAccountOf, sessionIdentityKey, type GuestIdentity, type SessionStorage } from './session';

/**
 * UN COMPTE CONNECTÉ QUI REJOINT UN LIEN EN « ANONYME » (#8816, jumelle web de
 * #8726) — la session du compte n'est ni remplacée ni fermée : l'identité
 * anonyme est TENUE À CÔTÉ, une par conversation, et ne devient la session
 * EFFECTIVE que le temps de lire cette conversation-là.
 */

const NOW = Date.UTC(2026, 8, 30, 12, 0, 0);
const HOUR = 60 * 60 * 1000;

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

const guestOf = (conversationId: string, overrides: Partial<GuestIdentity> = {}): GuestIdentity => ({
  participantId: `p-${conversationId}`,
  nickname: 'Masque',
  conversationId,
  link: `mshy_${conversationId}`,
  mayWrite: true,
  ...overrides,
});

function signedInStore(options: { readonly storage?: ReturnType<typeof fakeStorage>; readonly clock?: { now: number } } = {}) {
  const storage = options.storage ?? fakeStorage();
  const clock = options.clock ?? { now: NOW };
  const store = createSessionStore({ storage, now: () => clock.now });
  store.getState().establish({
    user: { id: 'u-ada', username: 'ada', displayName: 'Ada Lovelace', avatar: 'avatars/user/u-ada.jpg', systemLanguage: 'fr' },
    token: 'jwt-ada',
    sessionToken: 'sess-ada',
    expiresIn: 86_400,
  });
  return { store, storage, clock };
}

describe('adoptAnonymous — rejoindre en anonyme depuis un compte', () => {
  test('la session effective devient l’invité, le compte reste TENU à côté', () => {
    const { store } = signedInStore();
    const account = store.getState().session;

    store.getState().adoptAnonymous({ sessionToken: 'anon_1', guest: guestOf('c-1') });

    const session = store.getState().session;
    expect(session.status).toBe('guest');
    expect(session.status === 'guest' ? session.sessionToken : null).toBe('anon_1');
    expect(heldAccountOf(session)).toEqual(account.status === 'authenticated' ? account : null);
  });

  test('`meeshy.session` garde le COMPTE : un rechargement ne perd pas la connexion', () => {
    const { store, storage } = signedInStore();
    store.getState().adoptAnonymous({ sessionToken: 'anon_1', guest: guestOf('c-1') });

    const persisted = JSON.parse(storage.raw.get('meeshy.session') ?? '{}');
    expect(persisted.kind).toBeUndefined();
    expect(persisted.token).toBe('jwt-ada');

    const reloaded = createSessionStore({ storage, now: () => NOW });
    reloaded.getState().restoreSession();
    expect(reloaded.getState().session.status).toBe('authenticated');
  });

  test('l’identité anonyme ne porte AUCUN champ du compte', () => {
    const { store, storage } = signedInStore();
    store.getState().adoptAnonymous({
      sessionToken: 'anon_1',
      guest: { ...guestOf('c-1'), ...({ userId: 'u-ada', email: 'ada@x.io' } as object) },
    });

    const session = store.getState().session;
    const guest = session.status === 'guest' ? session.guest : null;
    expect(guest).toEqual(guestOf('c-1'));
    const stored = storage.raw.get('meeshy.anonymous-sessions.u_u-ada') ?? '';
    expect(stored).not.toContain('jwt-ada');
    expect(stored).not.toContain('sess-ada');
    expect(stored).not.toContain('Ada Lovelace');
    expect(stored).not.toContain('ada@x.io');
  });

  test('sans compte, c’est une session d’invité ordinaire (aucun compte tenu)', () => {
    const store = createSessionStore({ storage: fakeStorage(), now: () => NOW });
    store.getState().adoptAnonymous({ sessionToken: 'anon_1', guest: guestOf('c-1') });

    const session = store.getState().session;
    expect(session.status).toBe('guest');
    expect(heldAccountOf(session)).toBeNull();
  });

  test('l’identité de la requête change : le cache du compte ne se mêle pas à celui de l’invité', () => {
    const { store } = signedInStore();
    const before = sessionIdentityKey(store.getState().session);
    store.getState().adoptAnonymous({ sessionToken: 'anon_1', guest: guestOf('c-1') });
    expect(sessionIdentityKey(store.getState().session)).toBe('g:anon_1');
    expect(before).toBe('u:u-ada');
  });
});

describe('scopeAnonymous — l’identité suit la conversation lue', () => {
  test('quitter la conversation rend le COMPTE, intact', () => {
    const { store } = signedInStore();
    const account = store.getState().session;
    store.getState().adoptAnonymous({ sessionToken: 'anon_1', guest: guestOf('c-1') });

    store.getState().scopeAnonymous(null);

    expect(store.getState().session).toEqual(account);
  });

  test('revenir sur la conversation reprend l’identité anonyme tenue', () => {
    const { store } = signedInStore();
    store.getState().adoptAnonymous({ sessionToken: 'anon_1', guest: guestOf('c-1') });
    store.getState().scopeAnonymous(null);

    expect(store.getState().anonymousScopeFor('c-1')).toBe('c-1');
    store.getState().scopeAnonymous('c-1');

    const session = store.getState().session;
    expect(session.status === 'guest' ? session.guest.conversationId : null).toBe('c-1');
  });

  test('une conversation SANS identité anonyme reste sous le compte', () => {
    const { store } = signedInStore();
    store.getState().adoptAnonymous({ sessionToken: 'anon_1', guest: guestOf('c-1') });

    expect(store.getState().anonymousScopeFor('c-2')).toBeNull();
    store.getState().scopeAnonymous('c-2');

    expect(store.getState().session.status).toBe('authenticated');
  });

  test('UNE identité par conversation : passer de l’une à l’autre ne les confond pas', () => {
    const { store } = signedInStore();
    store.getState().adoptAnonymous({ sessionToken: 'anon_1', guest: guestOf('c-1') });
    store.getState().adoptAnonymous({ sessionToken: 'anon_2', guest: guestOf('c-2') });

    store.getState().scopeAnonymous('c-1');
    const first = store.getState().session;
    store.getState().scopeAnonymous('c-2');
    const second = store.getState().session;

    expect(first.status === 'guest' ? first.sessionToken : null).toBe('anon_1');
    expect(second.status === 'guest' ? second.sessionToken : null).toBe('anon_2');
    expect(heldAccountOf(second)?.user.id).toBe('u-ada');
  });

  test('l’identité anonyme survit au rechargement, sous le compte qui l’a ouverte', () => {
    const { store, storage } = signedInStore();
    store.getState().adoptAnonymous({ sessionToken: 'anon_1', guest: guestOf('c-1') });

    const reloaded = createSessionStore({ storage, now: () => NOW + HOUR });
    reloaded.getState().restoreSession();
    reloaded.getState().scopeAnonymous('c-1');

    const session = reloaded.getState().session;
    expect(session.status === 'guest' ? session.sessionToken : null).toBe('anon_1');
  });

  test('un AUTRE compte du même appareil ne la voit pas', () => {
    const { store, storage } = signedInStore();
    store.getState().adoptAnonymous({ sessionToken: 'anon_1', guest: guestOf('c-1') });
    store.getState().scopeAnonymous(null);

    store.getState().establish({ user: { id: 'u-bob', username: 'bob' }, token: 'jwt-bob', sessionToken: 'sess-bob', expiresIn: 3600 });

    expect(store.getState().anonymousScopeFor('c-1')).toBeNull();
    expect(storage.raw.has('meeshy.anonymous-sessions.u_u-ada')).toBe(true);
  });

  test('une identité anonyme ÉCHUE n’est plus reprise, et quitte le stockage', () => {
    const { store, storage, clock } = signedInStore();
    store.getState().adoptAnonymous({ sessionToken: 'anon_1', guest: guestOf('c-1') });
    store.getState().scopeAnonymous(null);

    clock.now = NOW + 25 * HOUR;
    expect(store.getState().anonymousScopeFor('c-1')).toBeNull();
    store.getState().scopeAnonymous('c-1');
    expect(store.getState().session.status).toBe('authenticated');
    expect(storage.raw.get('meeshy.anonymous-sessions.u_u-ada') ?? '[]').not.toContain('anon_1');
  });

  test('stockage BORNÉ : la plus ancienne identité part au-delà du plafond', () => {
    const { store, storage, clock } = signedInStore();
    Array.from({ length: 21 }, (_, index) => index).forEach((index) => {
      clock.now = NOW + index * 1000;
      store.getState().adoptAnonymous({ sessionToken: `anon_${index}`, guest: guestOf(`c-${index}`) });
    });
    store.getState().scopeAnonymous(null);

    expect(store.getState().anonymousScopeFor('c-0')).toBeNull();
    expect(store.getState().anonymousScopeFor('c-20')).toBe('c-20');
    const stored: unknown = JSON.parse(storage.raw.get('meeshy.anonymous-sessions.u_u-ada') ?? '[]');
    expect(Array.isArray(stored) ? stored.length : -1).toBe(20);
  });

  test('un stockage corrompu ne restaure rien — jamais une identité à moitié', () => {
    const storage = fakeStorage({ 'meeshy.anonymous-sessions.u_u-ada': '{pas du json' });
    const { store } = signedInStore({ storage });
    expect(store.getState().anonymousScopeFor('c-1')).toBeNull();
  });
});

describe('dropAnonymous — l’identité anonyme refusée ou abandonnée', () => {
  test('rend le compte sans le fermer, et oublie l’identité', () => {
    const { store } = signedInStore();
    const account = store.getState().session;
    store.getState().adoptAnonymous({ sessionToken: 'anon_1', guest: guestOf('c-1') });

    store.getState().dropAnonymous('c-1');

    expect(store.getState().session).toEqual(account);
    expect(store.getState().anonymousScopeFor('c-1')).toBeNull();
  });

  test('clearSession (déconnexion) ferme le compte même sous une identité anonyme', () => {
    const { store } = signedInStore();
    store.getState().adoptAnonymous({ sessionToken: 'anon_1', guest: guestOf('c-1') });

    store.getState().clearSession();

    expect(store.getState().session).toEqual({ status: 'anonymous' });
  });
});
