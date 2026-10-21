import { describe, expect, test } from 'bun:test';

import { endRevokedSession } from './account-caches';
import { endGuestAccess, guestAccessEndOf, guestAccessEndOfSocketError, guestAccessEndedOf, type GuestAccessEnd } from './guest-access-end';
import { createHttpTransport, type Credential } from './http';
import { createSessionStore, SESSION_STORAGE_KEY, type GuestIdentity } from './session';

/**
 * **LA FIN DE L'ACCÈS D'UN INVITÉ** (#10442) — à 403 `SHARE_LINK_EXPIRED` et
 * 410 `GUEST_ACCESS_REVOKED`, la session de lien est oubliée (jeton effacé du
 * stockage) et l'invité revient à la page de son lien, qui dit pourquoi.
 */

function fakeStorage() {
  const raw = new Map<string, string>();
  return {
    raw,
    getItem: (key: string) => raw.get(key) ?? null,
    setItem: (key: string, value: string) => {
      raw.set(key, value);
    },
    removeItem: (key: string) => {
      raw.delete(key);
    },
  };
}

const GUEST: GuestIdentity = {
  participantId: 'p-1',
  nickname: 'Awa',
  conversationId: 'c-1',
  link: 'mshy_equipe_7f3a',
  mayWrite: true,
};

const ACCOUNT = { id: '0'.repeat(24), username: 'ada', displayName: 'Ada', avatar: '', systemLanguage: 'en' };

const replying = (status: number, body: unknown): typeof fetch =>
  (async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch;

function transportFor(credential: Credential | null, status: number, body: unknown) {
  const ended: GuestAccessEnd[] = [];
  const unauthorized: number[] = [];
  const transport = createHttpTransport({
    base: '',
    credential: () => credential,
    fetchImpl: replying(status, body),
    timeoutMs: 0,
    onUnauthorized: () => unauthorized.push(1),
    onGuestAccessEnded: (reason) => ended.push(reason),
  });
  return { transport, ended, unauthorized };
}

const ANONYMOUS: Credential = { kind: 'anonymous', sessionToken: 'anon_abc' };
const REGISTERED: Credential = { kind: 'registered', token: 'jwt' };
const EXPIRED_BODY = { success: false, error: 'This share link has expired', code: 'SHARE_LINK_EXPIRED' };
const REVOKED_BODY = { success: false, error: 'GUEST_ACCESS_REVOKED', message: "L'acces de cet invite a ete retire" };

describe('le transport reconnaît la fin de l’accès d’un invité', () => {
  test('403 SHARE_LINK_EXPIRED sur un jeton d’invité ⇒ « expired »', async () => {
    const { transport, ended, unauthorized } = transportFor(ANONYMOUS, 403, EXPIRED_BODY);
    const result = await transport.request({ method: 'GET', path: '/conversations/c-1/messages' });
    expect(result.ok).toBe(false);
    expect(ended).toEqual(['expired']);
    expect(unauthorized).toEqual([]);
  });

  test('410 GUEST_ACCESS_REVOKED sur un jeton d’invité ⇒ « revoked »', async () => {
    const { transport, ended } = transportFor(ANONYMOUS, 410, REVOKED_BODY);
    await transport.request({ method: 'POST', path: '/conversations/c-1/messages', body: { content: 'x' } });
    expect(ended).toEqual(['revoked']);
  });

  test('le même refus sur un COMPTE ne ferme rien : ce n’est pas une session de lien', async () => {
    const { transport, ended } = transportFor(REGISTERED, 403, EXPIRED_BODY);
    await transport.request({ method: 'GET', path: '/conversations/c-1/messages' });
    expect(ended).toEqual([]);
  });

  test('un autre 403 ou un autre 410 d’invité ne ferme rien', async () => {
    const forbidden = transportFor(ANONYMOUS, 403, { success: false, error: 'Access denied', code: 'FORBIDDEN' });
    await forbidden.transport.request({ method: 'GET', path: '/x' });
    const gone = transportFor(ANONYMOUS, 410, { success: false, error: 'Gone' });
    await gone.transport.request({ method: 'GET', path: '/x' });
    expect([...forbidden.ended, ...gone.ended]).toEqual([]);
  });

  test('un appel au crédential FORCÉ (jonction) n’appartient à aucune session : rien ne se ferme', async () => {
    const { transport, ended } = transportFor(ANONYMOUS, 403, EXPIRED_BODY);
    await transport.request({ method: 'POST', path: '/links/mshy/members', credential: ANONYMOUS });
    expect(ended).toEqual([]);
  });
});

describe('les codes, lus une fois', () => {
  test('REST, socket et adresse', () => {
    expect(guestAccessEndOf({ status: 403, code: 'SHARE_LINK_EXPIRED' })).toBe('expired');
    expect(guestAccessEndOf({ status: 410, error: 'GUEST_ACCESS_REVOKED' })).toBe('revoked');
    expect(guestAccessEndOf({ status: 401, code: 'SHARE_LINK_EXPIRED' })).toBeNull();
    expect(guestAccessEndOfSocketError({ message: 'This share link has expired', code: 'SHARE_LINK_EXPIRED' })).toBe('expired');
    expect(guestAccessEndOfSocketError({ message: 'Guest access has been revoked', code: 'GUEST_ACCESS_REVOKED' })).toBe('revoked');
    expect(guestAccessEndOfSocketError({ message: 'Authentication failed' })).toBeNull();
    expect(guestAccessEndOfSocketError('SHARE_LINK_EXPIRED')).toBeNull();
    expect(guestAccessEndedOf('expired')).toBe('expired');
    expect(guestAccessEndedOf('revoked')).toBe('revoked');
    expect(guestAccessEndedOf('autre')).toBeNull();
    expect(guestAccessEndedOf(null)).toBeNull();
  });
});

describe('endGuestAccess — l’appareil oublie l’invité et le ramène à son lien', () => {
  test('invité sans compte : jeton effacé du stockage, session anonyme, page du lien avec le motif', () => {
    const storage = fakeStorage();
    const store = createSessionStore({ storage });
    store.getState().establishGuest({ sessionToken: 'anon_abc', guest: GUEST });
    expect(storage.raw.has(SESSION_STORAGE_KEY)).toBe(true);
    const visits: [string, boolean][] = [];

    endGuestAccess({ reason: 'expired', store, end: (s) => endRevokedSession(s), navigate: (url, replace) => visits.push([url, replace]) });

    expect(store.getState().session.status).toBe('anonymous');
    expect(storage.raw.has(SESSION_STORAGE_KEY)).toBe(false);
    expect(visits).toEqual([['/chat/mshy_equipe_7f3a?ended=expired', true]]);
  });

  test('identité anonyme tenue par un compte : l’invité part, le compte reste', () => {
    const store = createSessionStore({ storage: fakeStorage() });
    store.getState().establish({ user: ACCOUNT, token: 'jwt', sessionToken: 'sess', expiresIn: 3600 });
    store.getState().adoptAnonymous({ sessionToken: 'anon_abc', guest: GUEST });
    const visits: string[] = [];

    endGuestAccess({ reason: 'revoked', store, end: (s) => endRevokedSession(s), navigate: (url) => visits.push(url) });

    const session = store.getState().session;
    expect(session.status).toBe('authenticated');
    expect(store.getState().anonymousScopeFor('c-1')).toBeNull();
    expect(visits).toEqual(['/chat/mshy_equipe_7f3a?ended=revoked']);
  });

  test('hors session d’invité, rien ne bouge', () => {
    const store = createSessionStore({ storage: fakeStorage() });
    store.getState().establish({ user: ACCOUNT, token: 'jwt', sessionToken: 'sess', expiresIn: 3600 });
    const visits: string[] = [];
    endGuestAccess({ reason: 'expired', store, end: (s) => endRevokedSession(s), navigate: (url) => visits.push(url) });
    expect(store.getState().session.status).toBe('authenticated');
    expect(visits).toEqual([]);
  });
});
