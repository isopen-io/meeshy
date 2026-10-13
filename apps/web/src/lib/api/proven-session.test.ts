import { describe, expect, test } from 'bun:test';

import type { ApiResult, HttpRequest } from './http';
import { accountReplacementOf, createProvenSessionGestures, provenEmailOf, provenSessionOf, type AccountReplacement } from './proven-session';
import { createSessionStore, type SessionStoreApi } from './session';

/**
 * UN LIEN N'OUVRE JAMAIS UN AUTRE COMPTE SANS LE DEMANDER (#10451, jumelle web
 * de #10445) — la décision se prend APRÈS la preuve, sur l'id que la passerelle
 * rend, jamais sur ce que le lien prétend. Même compte ⇒ rotation ; autre
 * compte sur un appareil connecté ⇒ question. Refuser referme côté passerelle
 * la session que la preuve a créée ; accepter range le compte quitté au
 * sélecteur, comme « Changer de compte ».
 */

const NOW = Date.UTC(2026, 9, 13, 12, 0, 0);

function memoryStore(): SessionStoreApi {
  const raw = new Map<string, string>();
  return createSessionStore({
    storage: {
      getItem: (key) => raw.get(key) ?? null,
      setItem: (key, value) => {
        raw.set(key, value);
      },
      removeItem: (key) => {
        raw.delete(key);
      },
    },
    now: () => NOW,
  });
}

function signedInAsAda(store: SessionStoreApi): void {
  store.getState().establish({ user: { id: 'u-ada', username: 'ada', displayName: 'Ada' }, token: 'jwt-ada', sessionToken: 'sess-ada', expiresIn: 3_600 });
}

const BOB_LOGIN = {
  user: { id: 'u-bob', username: 'bob', displayName: 'Bob', avatar: 'https://cdn.meeshy.example/bob.png' },
  token: 'jwt-bob',
  sessionToken: 'sess-bob',
  expiresIn: 86_400,
};

describe('provenSessionOf — ce que la preuve a rendu', () => {
  test('une session de connexion, une session de vérification (24 h par défaut), un défi de second facteur', () => {
    expect(provenSessionOf(BOB_LOGIN)).toEqual({ kind: 'session', ...BOB_LOGIN });
    expect(provenSessionOf({ verified: true, token: 'jwt-v', sessionToken: 'sess-v', user: { id: 'u-v', username: 'v' } })).toEqual({
      kind: 'session',
      user: { id: 'u-v', username: 'v' },
      token: 'jwt-v',
      sessionToken: 'sess-v',
      expiresIn: 24 * 60 * 60,
    });
    const pending = { id: 'u-2fa', username: 'deux', email: 'deux@x.io', firstName: 'D', lastName: 'F', displayName: 'Deux' };
    expect(provenSessionOf({ requires2FA: true, twoFactorToken: 'tf', user: pending, message: 'code' })).toEqual({
      kind: 'second-factor',
      user: pending,
      twoFactorToken: 'tf',
    });
  });

  test('l’adresse du compte prouvé voyage quand la passerelle la sert', () => {
    const proven = provenSessionOf({ ...BOB_LOGIN, user: { ...BOB_LOGIN.user, email: 'bob@meeshy.example' } });
    expect(proven === null ? null : provenEmailOf(proven)).toBe('bob@meeshy.example');
    const bare = provenSessionOf(BOB_LOGIN);
    expect(bare === null ? 'absent' : provenEmailOf(bare)).toBeNull();
  });

  test('rien de prouvé : vérification sans session, compte à activer', () => {
    expect(provenSessionOf({ verified: true, message: 'ok' })).toBeNull();
    expect(provenSessionOf({ status: 'verification-required', accountCreated: true, email: 'a@x.io' })).toBeNull();
  });
});

describe('accountReplacementOf — la décision, sur l’id prouvé', () => {
  test('aucun compte ouvert ⇒ aucune question', () => {
    const store = memoryStore();
    expect(accountReplacementOf(store.getState().session, provenSessionOf(BOB_LOGIN))).toBeNull();
  });

  test('même compte ⇒ aucune question (rotation)', () => {
    const store = memoryStore();
    signedInAsAda(store);
    expect(accountReplacementOf(store.getState().session, provenSessionOf({ ...BOB_LOGIN, user: { id: 'u-ada', username: 'ada' } }))).toBeNull();
  });

  test('un AUTRE compte sur un appareil connecté ⇒ la question, avec les deux comptes', () => {
    const store = memoryStore();
    signedInAsAda(store);
    const replacement = accountReplacementOf(store.getState().session, provenSessionOf(BOB_LOGIN));
    expect(replacement?.current).toEqual({ id: 'u-ada', username: 'ada', displayName: 'Ada' });
    expect(replacement?.proven.user.id).toBe('u-bob');
  });

  test('un compte tenu derrière une identité anonyme (#8816) compte aussi', () => {
    const store = memoryStore();
    signedInAsAda(store);
    store.getState().adoptAnonymous({ sessionToken: 'anon', guest: { participantId: 'p-1', nickname: 'invite', conversationId: 'c-1', link: 'lien', mayWrite: true } });
    expect(accountReplacementOf(store.getState().session, provenSessionOf(BOB_LOGIN))?.current.id).toBe('u-ada');
  });
});

function recordingTransport() {
  const calls: HttpRequest[] = [];
  return {
    calls,
    transport: {
      request: async <T,>(request: HttpRequest): Promise<ApiResult<T>> => {
        calls.push(request);
        return { ok: true, data: { message: 'ok' } as T, status: 200 };
      },
    },
  };
}

function replacementIn(store: SessionStoreApi): AccountReplacement {
  const replacement = accountReplacementOf(store.getState().session, provenSessionOf(BOB_LOGIN));
  if (replacement === null) throw new Error('aucune question');
  return replacement;
}

describe('createProvenSessionGestures — accepter ou refuser', () => {
  test('refuser : la session ouverte reste intacte, la session prouvée est refermée par la déconnexion, avec SES jetons', async () => {
    const store = memoryStore();
    signedInAsAda(store);
    const before = store.getState().session;
    const { calls, transport } = recordingTransport();
    const suspended: string[] = [];
    const gestures = createProvenSessionGestures({ store, transport, suspend: () => suspended.push('suspend'), noteActive: () => undefined });

    await gestures.discard(replacementIn(store));

    expect(store.getState().session).toBe(before);
    expect(suspended).toEqual([]);
    expect(calls).toEqual([
      {
        method: 'POST',
        path: '/api/v1/auth/logout',
        credential: { kind: 'registered', token: 'jwt-bob' },
        headers: { 'X-Session-Token': 'sess-bob' },
      },
    ]);
  });

  test('refuser un défi de second facteur : rien à refermer, rien ne part', async () => {
    const store = memoryStore();
    signedInAsAda(store);
    const { calls, transport } = recordingTransport();
    const gestures = createProvenSessionGestures({ store, transport, suspend: () => undefined, noteActive: () => undefined });
    const pending = { id: 'u-2fa', username: 'deux', email: 'deux@x.io', firstName: 'D', lastName: 'F', displayName: 'Deux' };
    const replacement = accountReplacementOf(store.getState().session, provenSessionOf({ requires2FA: true, twoFactorToken: 'tf', user: pending, message: 'code' }));
    if (replacement === null) throw new Error('aucune question');

    await gestures.discard(replacement);

    expect(calls).toEqual([]);
    expect(store.getState().session.status).toBe('authenticated');
  });

  test('accepter : le compte ouvert est rangé (suspend) AVANT que la session prouvée ne s’ouvre, et le nouveau compte entre dans la liste', async () => {
    const store = memoryStore();
    signedInAsAda(store);
    const order: string[] = [];
    const { calls, transport } = recordingTransport();
    const gestures = createProvenSessionGestures({
      store,
      transport,
      suspend: () => {
        order.push(`suspend:${store.getState().session.status}`);
        store.getState().clearSession();
      },
      noteActive: (user) => order.push(`noteActive:${user.id}`),
    });

    await gestures.adopt(replacementIn(store));

    expect(order).toEqual(['suspend:authenticated', 'noteActive:u-bob']);
    expect(calls).toEqual([]);
    const session = store.getState().session;
    expect(session.status === 'authenticated' ? [session.user.id, session.token, session.sessionToken] : null).toEqual(['u-bob', 'jwt-bob', 'sess-bob']);
  });

  test('accepter alors que la session ouverte n’a PAS été démontée : rien n’est posé, la session prouvée est refermée', async () => {
    const store = memoryStore();
    signedInAsAda(store);
    const before = store.getState().session;
    const { calls, transport } = recordingTransport();
    const noted: string[] = [];
    const gestures = createProvenSessionGestures({ store, transport, suspend: () => undefined, noteActive: (user) => noted.push(user.id) });

    await gestures.adopt(replacementIn(store));

    expect(store.getState().session).toBe(before);
    expect(noted).toEqual([]);
    expect(calls.map((call) => [call.path, call.credential])).toEqual([['/api/v1/auth/logout', { kind: 'registered', token: 'jwt-bob' }]]);
  });

  test('accepter un défi de second facteur : le compte ouvert est rangé, puis le défi attend son code', async () => {
    const store = memoryStore();
    signedInAsAda(store);
    const { transport } = recordingTransport();
    const gestures = createProvenSessionGestures({ store, transport, suspend: () => store.getState().clearSession(), noteActive: () => undefined });
    const pending = { id: 'u-2fa', username: 'deux', email: 'deux@x.io', firstName: 'D', lastName: 'F', displayName: 'Deux' };
    const replacement = accountReplacementOf(store.getState().session, provenSessionOf({ requires2FA: true, twoFactorToken: 'tf', user: pending, message: 'code' }));
    if (replacement === null) throw new Error('aucune question');

    await gestures.adopt(replacement);

    expect(store.getState().session).toEqual({ status: 'pending2fa', user: pending, twoFactorToken: 'tf' });
  });
});
