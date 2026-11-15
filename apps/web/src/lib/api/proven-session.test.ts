import { describe, expect, test } from 'bun:test';

import { PROVEN_ADOPTION_CLIENT_FALLBACK_MS } from '@meeshy/shared/utils/proven-session-adoption';

import type { ApiResult, HttpRequest } from './http';
import {
  accountReplacementOf,
  createProvenSessionGestures,
  provenEmailOf,
  provenSessionOf,
  type AccountReplacement,
} from './proven-session';
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
const MINUTE = 60 * 1000;
/* Le repli d'un client que la passerelle ne renseigne pas (#10518) : il vit
   dans @meeshy/shared, où un témoin de la passerelle le compare à ses vraies
   fenêtres. */
const PROVEN_SESSION_CLIENT_ADOPTION_WINDOW_MS = PROVEN_ADOPTION_CLIENT_FALLBACK_MS.session;
const PROVEN_TWO_FACTOR_CLIENT_WINDOW_MS = PROVEN_ADOPTION_CLIENT_FALLBACK_MS['second-factor'];

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
    expect(provenSessionOf(BOB_LOGIN, NOW)).toEqual({ kind: 'session', ...BOB_LOGIN, receivedAt: NOW });
    expect(provenSessionOf({ verified: true, token: 'jwt-v', sessionToken: 'sess-v', user: { id: 'u-v', username: 'v' } }, NOW)).toEqual({
      kind: 'session',
      user: { id: 'u-v', username: 'v' },
      token: 'jwt-v',
      sessionToken: 'sess-v',
      expiresIn: 24 * 60 * 60,
      receivedAt: NOW,
    });
    const pending = { id: 'u-2fa', username: 'deux', email: 'deux@x.io', firstName: 'D', lastName: 'F', displayName: 'Deux' };
    expect(provenSessionOf({ requires2FA: true, twoFactorToken: 'tf', user: pending, message: 'code' }, NOW)).toEqual({
      kind: 'second-factor',
      user: pending,
      twoFactorToken: 'tf',
      receivedAt: NOW,
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
  test('refuser : la session ouverte reste intacte, la session prouvée est refermée par la déconnexion, avec SES jetons, en keepalive pour survivre à la fermeture de l’onglet', async () => {
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
        keepalive: true,
      },
    ]);
  });

  test('abandonner (page déchargée, #10474) : la déconnexion part SANS attendre, en keepalive, avec les jetons prouvés', () => {
    const store = memoryStore();
    signedInAsAda(store);
    const before = store.getState().session;
    const { calls, transport } = recordingTransport();
    const gestures = createProvenSessionGestures({ store, transport, suspend: () => undefined, noteActive: () => undefined });

    gestures.abandon(replacementIn(store));

    expect(store.getState().session).toBe(before);
    expect(calls).toEqual([
      {
        method: 'POST',
        path: '/api/v1/auth/logout',
        credential: { kind: 'registered', token: 'jwt-bob' },
        headers: { 'X-Session-Token': 'sess-bob' },
        keepalive: true,
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

describe('accepter APRÈS la fenêtre d’adoption (#10513) — le compte ouvert reste ouvert', () => {
  /* La passerelle n'adopte une session prouvée que dans ses dix premières
     minutes (#10477) ; le client s'arrête une minute avant, pour qu'une
     session posée ne soit jamais déjà échue au premier appel. */
  function provenAt(store: SessionStoreApi, receivedAt: number): AccountReplacement {
    const replacement = accountReplacementOf(store.getState().session, provenSessionOf(BOB_LOGIN, receivedAt));
    if (replacement === null) throw new Error('aucune question');
    return replacement;
  }

  test('sans délai servi (passerelle antérieure à #10518), la fenêtre du client est son repli de neuf minutes', () => {
    expect(PROVEN_SESSION_CLIENT_ADOPTION_WINDOW_MS).toBe(9 * 60 * 1000);
  });

  test('preuve reçue il y a plus de 9 minutes : rien n’est suspendu ni posé, la session prouvée est refermée, la réponse dit « expiré »', async () => {
    const store = memoryStore();
    signedInAsAda(store);
    const before = store.getState().session;
    const { calls, transport } = recordingTransport();
    const order: string[] = [];
    const gestures = createProvenSessionGestures({
      store,
      transport,
      suspend: () => {
        order.push('suspend');
        store.getState().clearSession();
      },
      noteActive: (user) => order.push(`noteActive:${user.id}`),
      now: () => NOW + PROVEN_SESSION_CLIENT_ADOPTION_WINDOW_MS + 1,
    });

    const outcome = await gestures.adopt(provenAt(store, NOW));

    expect(outcome).toBe('expired');
    expect(order).toEqual([]);
    expect(store.getState().session).toBe(before);
    expect(calls.map((call) => [call.path, call.credential])).toEqual([['/api/v1/auth/logout', { kind: 'registered', token: 'jwt-bob' }]]);
  });

  test('preuve reçue il y a moins de 9 minutes : rien ne change, le compte quitté est rangé et le compte prouvé s’ouvre', async () => {
    const store = memoryStore();
    signedInAsAda(store);
    const { transport } = recordingTransport();
    const gestures = createProvenSessionGestures({
      store,
      transport,
      suspend: () => store.getState().clearSession(),
      noteActive: () => undefined,
      now: () => NOW + PROVEN_SESSION_CLIENT_ADOPTION_WINDOW_MS - 1,
    });

    const outcome = await gestures.adopt(provenAt(store, NOW));

    expect(outcome).toBe(true);
    const session = store.getState().session;
    expect(session.status === 'authenticated' ? session.user.id : null).toBe('u-bob');
  });

  test('un défi de second facteur reçu il y a plus de 4 minutes (5 à la passerelle) : rien n’est suspendu, la réponse dit « expiré »', async () => {
    const store = memoryStore();
    signedInAsAda(store);
    const before = store.getState().session;
    const { calls, transport } = recordingTransport();
    const suspended: string[] = [];
    const gestures = createProvenSessionGestures({
      store,
      transport,
      suspend: () => suspended.push('suspend'),
      noteActive: () => undefined,
      now: () => NOW + PROVEN_TWO_FACTOR_CLIENT_WINDOW_MS + 1,
    });
    const pending = { id: 'u-2fa', username: 'deux', email: 'deux@x.io', firstName: 'D', lastName: 'F', displayName: 'Deux' };
    const replacement = accountReplacementOf(store.getState().session, provenSessionOf({ requires2FA: true, twoFactorToken: 'tf', user: pending, message: 'code' }, NOW));
    if (replacement === null) throw new Error('aucune question');

    expect(PROVEN_TWO_FACTOR_CLIENT_WINDOW_MS).toBe(4 * 60 * 1000);
    expect(await gestures.adopt(replacement)).toBe('expired');
    expect(suspended).toEqual([]);
    expect(store.getState().session).toBe(before);
    expect(calls).toEqual([]);
  });
});

describe('la fenêtre d’adoption se LIT chez la passerelle (#10518)', () => {
  const pending = { id: 'u-2fa', username: 'deux', email: 'deux@x.io', firstName: 'D', lastName: 'F', displayName: 'Deux' };

  function adoptAfter(data: object, elapsed: number) {
    const store = memoryStore();
    signedInAsAda(store);
    const before = store.getState().session;
    const { transport } = recordingTransport();
    const suspended: string[] = [];
    const gestures = createProvenSessionGestures({
      store,
      transport,
      suspend: () => {
        suspended.push('suspend');
        store.getState().clearSession();
      },
      noteActive: () => undefined,
      now: () => NOW + elapsed,
    });
    const replacement = accountReplacementOf(store.getState().session, provenSessionOf(data, NOW));
    if (replacement === null) throw new Error('aucune question');
    return gestures.adopt(replacement).then((outcome) => ({ outcome, suspended, untouched: store.getState().session === before }));
  }

  test('la preuve garde le délai servi, pour une session comme pour un défi', () => {
    expect(provenSessionOf({ ...BOB_LOGIN, adoptWithinSeconds: 600 }, NOW)).toEqual({ kind: 'session', ...BOB_LOGIN, adoptWithinSeconds: 600, receivedAt: NOW });
    expect(provenSessionOf({ requires2FA: true, twoFactorToken: 'tf', user: pending, adoptWithinSeconds: 300 }, NOW)).toEqual({
      kind: 'second-factor',
      user: pending,
      twoFactorToken: 'tf',
      adoptWithinSeconds: 300,
      receivedAt: NOW,
    });
  });

  test('une passerelle qui RACCOURCIT sa fenêtre à trois minutes est suivie : passé deux minutes, « expiré » et rien n’est suspendu', async () => {
    const late = await adoptAfter({ ...BOB_LOGIN, adoptWithinSeconds: 180 }, 2 * MINUTE + 1);
    expect(late).toEqual({ outcome: 'expired', suspended: [], untouched: true });

    const inTime = await adoptAfter({ ...BOB_LOGIN, adoptWithinSeconds: 180 }, 2 * MINUTE - 1);
    expect(inTime.outcome).toBe(true);
  });

  test('une passerelle qui l’ALLONGE est suivie jusqu’à la borne : à vingt minutes d’une fenêtre de vingt-cinq, le compte s’ouvre', async () => {
    expect((await adoptAfter({ ...BOB_LOGIN, adoptWithinSeconds: 1500 }, 20 * MINUTE)).outcome).toBe(true);
    expect((await adoptAfter({ ...BOB_LOGIN, adoptWithinSeconds: 1500 }, 24 * MINUTE + 1)).outcome).toBe('expired');
  });

  test('un délai servi démesuré est PLAFONNÉ à trente minutes : la preuve finit toujours par expirer', async () => {
    const data = { ...BOB_LOGIN, adoptWithinSeconds: 1e9 };
    expect((await adoptAfter(data, 30 * MINUTE - 1)).outcome).toBe(true);
    expect((await adoptAfter(data, 30 * MINUTE + 1)).outcome).toBe('expired');
    expect((await adoptAfter(data, 24 * 60 * MINUTE)).outcome).toBe('expired');
  });

  test('le défi de second facteur suit le délai servi pour LUI', async () => {
    const challenge = { requires2FA: true, twoFactorToken: 'tf', user: pending, adoptWithinSeconds: 120 };
    expect((await adoptAfter(challenge, MINUTE + 1)).outcome).toBe('expired');
    expect((await adoptAfter(challenge, MINUTE - 1)).outcome).toBe(true);
  });

  ['600', null, Number.NaN, -5, Number.POSITIVE_INFINITY, 1.7e308, 599.5].forEach((adoptWithinSeconds) => {
    test(`un délai illisible (${String(adoptWithinSeconds)}) vaut un délai absent : le repli de neuf minutes, jamais plus`, async () => {
      const data = { ...BOB_LOGIN, adoptWithinSeconds };
      expect((await adoptAfter(data, PROVEN_SESSION_CLIENT_ADOPTION_WINDOW_MS + 1)).outcome).toBe('expired');
      expect((await adoptAfter(data, PROVEN_SESSION_CLIENT_ADOPTION_WINDOW_MS - 1)).outcome).toBe(true);
    });
  });

  test('un délai servi à zéro ferme la fenêtre tout de suite', async () => {
    expect((await adoptAfter({ ...BOB_LOGIN, adoptWithinSeconds: 0 }, 1)).outcome).toBe('expired');
  });
});
