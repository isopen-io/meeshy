import { describe, expect, test } from 'bun:test';

import { createSessionStore, type SessionStorage, type SessionUser } from './session';

/**
 * **L'ADRESSE NON PROUVÉE VOYAGE AVEC LA SESSION** (#8365) — pour que le geste
 * « Publier » ouvre la validation de l'e-mail AVANT tout envoi, la session doit
 * savoir, sans aller-retour, que l'adresse du compte n'est pas prouvée. La
 * connexion le sert (`formatUserResponse` : `emailVerifiedAt`, `activation`) ;
 * la session n'en retient qu'UN drapeau, jamais la charge.
 */

const NOW = Date.UTC(2026, 8, 27, 12, 0, 0);

function fakeStorage(): SessionStorage & { readonly raw: Map<string, string> } {
  const raw = new Map<string, string>();
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

const served = (extra: Record<string, unknown>): SessionUser =>
  ({ id: 'u-1', username: 'ada', displayName: 'Ada', email: 'ada@example.io', ...extra }) as SessionUser;

function signedIn(user: SessionUser) {
  const storage = fakeStorage();
  const store = createSessionStore({ storage, now: () => NOW });
  store.getState().establish({ user, token: 'jwt', sessionToken: 'sess', expiresIn: 86400 });
  return { store, storage };
}

function heldUser(store: ReturnType<typeof createSessionStore>) {
  const session = store.getState().session;
  if (session.status !== 'authenticated') throw new Error('session attendue');
  return session.user;
}

describe('la session retient qu’une adresse n’est pas prouvée', () => {
  test('`emailVerifiedAt: null` servi ⇒ `emailUnproven`, persisté, sans l’adresse', () => {
    const { store, storage } = signedIn(served({ emailVerifiedAt: null }));

    expect(heldUser(store).emailUnproven).toBe(true);
    const persisted = storage.raw.get('meeshy.session') ?? '';
    expect(JSON.parse(persisted).user.emailUnproven).toBe(true);
    expect(persisted).not.toContain('ada@example.io');
  });

  test('`activation.missing` contient `email` ⇒ `emailUnproven` (#8238)', () => {
    const { store } = signedIn(served({ activation: { phase: 'invite', deadline: null, missing: ['email', 'phone'] } }));

    expect(heldUser(store).emailUnproven).toBe(true);
  });

  test('adresse prouvée ⇒ aucun drapeau', () => {
    const { store } = signedIn(
      served({ emailVerifiedAt: '2026-09-01T00:00:00.000Z', activation: { phase: 'done', deadline: null, missing: ['phone'] } }),
    );

    expect(heldUser(store).emailUnproven).toBeUndefined();
  });

  test('rien de servi sur l’adresse ⇒ inconnu, donc aucun drapeau (la garde serveur tranchera)', () => {
    const { store } = signedIn(served({}));

    expect(heldUser(store).emailUnproven).toBeUndefined();
  });

  test('le drapeau survit à la restauration et à une édition de profil', () => {
    const { store, storage } = signedIn(served({ emailVerifiedAt: null }));
    store.getState().updateUser({ displayName: 'Ada L.' });
    expect(heldUser(store).emailUnproven).toBe(true);

    const restored = createSessionStore({ storage, now: () => NOW });
    restored.getState().restoreSession();
    expect(heldUser(restored).emailUnproven).toBe(true);
  });

  test('`noteEmailProven()` efface le drapeau et le persiste', () => {
    const { store, storage } = signedIn(served({ emailVerifiedAt: null }));

    store.getState().noteEmailProven();

    expect(heldUser(store).emailUnproven).toBeUndefined();
    expect(JSON.parse(storage.raw.get('meeshy.session') ?? '{}').user.emailUnproven).toBeUndefined();
  });
});
