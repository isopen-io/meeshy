import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { conversationStore } from '@/lib/conversation-store';
import type { SocketClient, SocketFactory, SocketHandler } from '@/lib/net/socket';
import { createOutboxStore } from '@/lib/send/outbox-store';

import { deletedAccountOf, deletedAccountOfRevocation } from './account-deleted';
import { resolveAccountDeletion } from './account-deletion';
import { createHttpTransport, type HttpTransport } from './http';
import { createRealtimeConnection, type RealtimeDeps } from './socket';
import { createTypingStore } from './typing-store';

/**
 * **« COMPTE SUPPRIMÉ » SE LIT SUR LE SEUL SIGNAL QUI LE DIT, ET POUR LE COMPTE
 * QU'IL NOMME** (#10237, contrat #10264). Les trois portes — 401 HTTP, socket,
 * lien de purge — rendent l'identifiant nommé ; un jeton expiré, une session
 * révoquée ou un 401 sans code n'en rendent aucun : purger sur eux effacerait
 * des photos uniques à chaque expiration de jeton.
 */

const replying = (status: number, body: unknown): typeof fetch =>
  (async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch;

function transportFor(status: number, body: unknown, options: { readonly identity?: () => string | null } = {}) {
  const deleted: string[] = [];
  const unauthorized: unknown[] = [];
  const transport = createHttpTransport({
    base: 'https://gate.test',
    credential: () => ({ kind: 'registered', token: 'jwt-ada' }),
    identity: options.identity ?? (() => 'u:u-ada'),
    onUnauthorized: (refusal) => unauthorized.push(refusal),
    onAccountDeleted: (accountId) => deleted.push(accountId),
    fetchImpl: replying(status, body),
    timeoutMs: 0,
  });
  return { transport, deleted, unauthorized };
}

describe('le signal — `code: ACCOUNT_DELETED` avec `accountId`, ou `deletedAccountId`', () => {
  test('seul ACCOUNT_DELETED avec un identifiant nomme un compte supprimé', () => {
    expect(deletedAccountOf({ code: 'ACCOUNT_DELETED', accountId: 'u-ada' })).toBe('u-ada');
    expect(deletedAccountOf({ code: 'AUTH_FAILED', accountId: 'u-ada' })).toBeNull();
    expect(deletedAccountOf({ code: 'SESSION_REVOKED', accountId: 'u-ada' })).toBeNull();
    expect(deletedAccountOf({ code: 'ACCOUNT_DELETED' })).toBeNull();
    expect(deletedAccountOf({ code: 'ACCOUNT_DELETED', accountId: '' })).toBeNull();
    expect(deletedAccountOf({ error: 'Invalid JWT token' })).toBeNull();
    expect(deletedAccountOf(null)).toBeNull();
  });

  test('une révocation ne nomme un compte supprimé que par `deletedAccountId`', () => {
    expect(deletedAccountOfRevocation({ code: 'session_revoked', reason: 'logout_all_devices', deletedAccountId: 'u-ada' })).toBe('u-ada');
    expect(deletedAccountOfRevocation({ code: 'session_revoked', reason: 'logout_all_devices' })).toBeNull();
    expect(deletedAccountOfRevocation(undefined)).toBeNull();
  });
});

describe('401 HTTP — `onUnauthorized` reçoit le corps, le compte nommé est signalé', () => {
  test('401 ACCOUNT_DELETED ⇒ le compte NOMMÉ part, et la session finit avec le refus lu', async () => {
    const { transport, deleted, unauthorized } = transportFor(401, { success: false, error: 'Ce compte a été supprimé', code: 'ACCOUNT_DELETED', accountId: 'u-ada' });
    const result = await transport.request({ method: 'GET', path: '/conversations' });
    expect(result.ok).toBe(false);
    expect(deleted).toEqual(['u-ada']);
    expect(unauthorized).toEqual([{ status: 401, code: 'ACCOUNT_DELETED', accountId: 'u-ada' }]);
  });

  test('401 AUTH_FAILED, SESSION_REVOKED ou sans code ⇒ la session finit, aucun compte ne part', async () => {
    for (const body of [
      { success: false, error: 'Invalid JWT token', code: 'AUTH_FAILED' },
      { success: false, error: 'Session revoked', code: 'SESSION_REVOKED', accountId: 'u-ada' },
      { success: false, error: 'Unauthorized' },
    ]) {
      const { transport, deleted, unauthorized } = transportFor(401, body);
      await transport.request({ method: 'GET', path: '/conversations' });
      expect(deleted).toEqual([]);
      expect(unauthorized).toHaveLength(1);
    }
  });

  test('un refus de /auth/refresh nommant le compte supprimé le signale aussi', async () => {
    const { transport, deleted } = transportFor(401, { success: false, error: 'Ce compte a été supprimé', code: 'ACCOUNT_DELETED', accountId: 'u-ada' });
    await transport.request({ method: 'POST', path: '/auth/refresh', body: { token: 'jwt-ada' } });
    expect(deleted).toEqual(['u-ada']);
  });

  test('ACCOUNT_DELETED hors d’un 401 ne signale rien', async () => {
    const { transport, deleted } = transportFor(403, { success: false, error: 'x', code: 'ACCOUNT_DELETED', accountId: 'u-ada' });
    await transport.request({ method: 'GET', path: '/conversations' });
    expect(deleted).toEqual([]);
  });

  test('bascule de compte pendant le vol : le compte NOMMÉ part, la session de l’autre compte reste', async () => {
    let identity = 'u:u-ada';
    const deleted: string[] = [];
    const unauthorized: unknown[] = [];
    const transport: HttpTransport = createHttpTransport({
      base: 'https://gate.test',
      credential: () => ({ kind: 'registered', token: 'jwt-ada' }),
      identity: () => identity,
      onUnauthorized: (refusal) => unauthorized.push(refusal),
      onAccountDeleted: (accountId) => deleted.push(accountId),
      fetchImpl: (async () => {
        identity = 'u:u-bob';
        return new Response(JSON.stringify({ success: false, error: 'x', code: 'ACCOUNT_DELETED', accountId: 'u-ada' }), { status: 401 });
      }) as unknown as typeof fetch,
      timeoutMs: 0,
    });
    void transport.request({ method: 'GET', path: '/conversations' });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(deleted).toEqual(['u-ada']);
    expect(unauthorized).toEqual([]);
  });

  test('un appel sans identité présentée ne signale rien', async () => {
    const deleted: string[] = [];
    const transport = createHttpTransport({
      base: 'https://gate.test',
      onAccountDeleted: (accountId) => deleted.push(accountId),
      fetchImpl: replying(401, { success: false, error: 'x', code: 'ACCOUNT_DELETED', accountId: 'u-ada' }),
      timeoutMs: 0,
    });
    await transport.request({ method: 'POST', path: '/auth/login', body: {} });
    expect(deleted).toEqual([]);
  });
});

describe('le compte nommé doit être celui du jeton présenté (audit #10237)', () => {
  const deletedBody = (accountId: string) => ({ success: false, error: 'x', code: 'ACCOUNT_DELETED', accountId });

  test('un 401 émis sous Ada qui nomme Bob ne fait partir personne', async () => {
    const { transport, deleted } = transportFor(401, deletedBody('u-bob'));
    await transport.request({ method: 'GET', path: '/conversations' });
    expect(deleted).toEqual([]);
  });

  test('un 401 sous une identité d’invité ne fait partir aucun compte', async () => {
    const { transport, deleted } = transportFor(401, deletedBody('u-ada'), { identity: () => 'g:session-token' });
    await transport.request({ method: 'GET', path: '/conversations' });
    expect(deleted).toEqual([]);
  });

  test('crédential forcé : seulement si l’appelant déclare le propriétaire du jeton, et que c’est lui qui est nommé', async () => {
    const forced = { kind: 'registered', token: 'jwt-other' } as const;
    const silent = transportFor(401, deletedBody('u-ada'));
    await silent.transport.request({ method: 'GET', path: '/me', credential: forced });
    expect(silent.deleted).toEqual([]);
    const declared = transportFor(401, deletedBody('u-cleo'));
    await declared.transport.request({ method: 'GET', path: '/me', credential: forced, tokenOwner: 'u-cleo' });
    expect(declared.deleted).toEqual(['u-cleo']);
    const other = transportFor(401, deletedBody('u-ada'));
    await other.transport.request({ method: 'GET', path: '/me', credential: forced, tokenOwner: 'u-cleo' });
    expect(other.deleted).toEqual([]);
  });

  test('en-têtes explicites d’une autre session : seulement si l’appelant déclare son propriétaire', async () => {
    const headers = { Authorization: 'Bearer jwt-cleo', 'X-Session-Token': 's-cleo' };
    const silent = transportFor(401, deletedBody('u-cleo'));
    await silent.transport.request({ method: 'POST', path: '/auth/logout', headers });
    expect(silent.deleted).toEqual([]);
    const declared = transportFor(401, deletedBody('u-cleo'));
    await declared.transport.request({ method: 'POST', path: '/auth/logout', headers, tokenOwner: 'u-cleo' });
    expect(declared.deleted).toEqual(['u-cleo']);
  });
});

function fakeSocket(): SocketClient & { fire(event: string, payload: unknown): void } {
  const handlers = new Map<string, Set<SocketHandler>>();
  let connected = false;
  return {
    get connected() {
      return connected;
    },
    connect: () => {
      connected = true;
    },
    disconnect: () => {
      connected = false;
    },
    on: (event, handler) => {
      const set = handlers.get(event) ?? new Set();
      set.add(handler as SocketHandler);
      handlers.set(event, set);
    },
    off: (event, handler) => {
      handlers.get(event)?.delete(handler as SocketHandler);
    },
    emit: () => undefined,
    fire: (event, payload) => {
      for (const handler of handlers.get(event) ?? []) handler(payload);
    },
  };
}

function connect(options: { readonly account?: string | null } = {}) {
  const socket = fakeSocket();
  const socketFactory: SocketFactory = () => socket;
  const deleted: string[] = [];
  const cleared: unknown[] = [];
  const deps: RealtimeDeps = {
    base: 'https://gate.test',
    socketFactory,
    queryClient: new QueryClient(),
    typing: createTypingStore(),
    conversationStore,
    outbox: createOutboxStore(),
    viewerId: () => 'u-ada',
    onClearSession: (reason) => cleared.push(reason),
    onAccountDeleted: (accountId) => deleted.push(accountId),
    account: options.account === undefined ? 'u-ada' : options.account,
  };
  const connection = createRealtimeConnection({ token: 'jwt-ada', sessionToken: 's' }, deps);
  return { socket, deleted, cleared, destroy: connection.destroy };
}

describe('socket — `error` et `auth:session-revoked`', () => {
  test('`error { code: ACCOUNT_DELETED, accountId }` ⇒ le compte nommé part', () => {
    const { socket, deleted, destroy } = connect();
    socket.fire(SERVER_EVENTS.ERROR, { message: 'Account disabled', code: 'ACCOUNT_DELETED', accountId: 'u-ada' });
    expect(deleted).toEqual(['u-ada']);
    destroy();
  });

  test('`error` « Account disabled » sans le code, ou d’un autre code ⇒ rien ne part', () => {
    const { socket, deleted, destroy } = connect();
    socket.fire(SERVER_EVENTS.ERROR, { message: 'Account disabled' });
    socket.fire(SERVER_EVENTS.ERROR, { message: 'Invalid token', code: 'AUTH_FAILED', accountId: 'u-ada' });
    expect(deleted).toEqual([]);
    destroy();
  });

  test('`auth:session-revoked` avec `deletedAccountId` ⇒ la session finit ET le compte nommé part', () => {
    const { socket, deleted, cleared, destroy } = connect();
    socket.fire(SERVER_EVENTS.AUTH_SESSION_REVOKED, { code: 'session_revoked', message: 'x', reason: 'logout_all_devices', deletedAccountId: 'u-ada' });
    expect(cleared).toEqual(['logout_all_devices']);
    expect(deleted).toEqual(['u-ada']);
    destroy();
  });

  test('`auth:session-revoked` sans `deletedAccountId` ⇒ la session finit, aucun compte ne part', () => {
    const { socket, deleted, cleared, destroy } = connect();
    socket.fire(SERVER_EVENTS.AUTH_SESSION_REVOKED, { code: 'session_revoked', message: 'x', reason: 'logout_all_devices' });
    expect(cleared).toEqual(['logout_all_devices']);
    expect(deleted).toEqual([]);
    destroy();
  });
});

describe('socket — seul le compte qui a OUVERT la connexion peut être nommé (audit #10237)', () => {
  test('une connexion ouverte par Ada qui reçoit « Bob supprimé » ne fait partir personne', () => {
    const { socket, deleted, destroy } = connect();
    socket.fire(SERVER_EVENTS.ERROR, { message: 'x', code: 'ACCOUNT_DELETED', accountId: 'u-bob' });
    socket.fire(SERVER_EVENTS.AUTH_SESSION_REVOKED, { code: 'session_revoked', message: 'x', reason: 'logout_all_devices', deletedAccountId: 'u-bob' });
    expect(deleted).toEqual([]);
    destroy();
  });

  test('une connexion d’invité (aucun compte) ne fait partir aucun compte', () => {
    const { socket, deleted, destroy } = connect({ account: null });
    socket.fire(SERVER_EVENTS.ERROR, { message: 'x', code: 'ACCOUNT_DELETED', accountId: 'u-ada' });
    socket.fire(SERVER_EVENTS.AUTH_SESSION_REVOKED, { code: 'session_revoked', message: 'x', reason: 'logout_all_devices', deletedAccountId: 'u-ada' });
    expect(deleted).toEqual([]);
    destroy();
  });
});

describe('lien de l’e-mail — `resolve` action `purge`', () => {
  const resolving = (data: unknown) => {
    const deleted: string[] = [];
    const transport = createHttpTransport({ base: 'https://gate.test', fetchImpl: replying(200, { success: true, data }), timeoutMs: 0 });
    return { deps: { source: 'gateway' as const, transport, onAccountDeleted: (id: string) => deleted.push(id) }, deleted };
  };

  test('la purge confirmée nomme le compte supprimé ⇒ il part', async () => {
    const { deps, deleted } = resolving({ status: 'COMPLETED', dataPurged: true, deletedAccountId: 'u-ada' });
    const result = await resolveAccountDeletion(deps, { token: 't', action: 'purge' });
    expect(result.ok).toBe(true);
    expect(deleted).toEqual(['u-ada']);
  });

  test('confirmer (grâce, annulable) ou annuler ne fait partir aucun compte', async () => {
    const confirm = resolving({ status: 'CONFIRMED', gracePeriodEndsAt: '2026-11-12T00:00:00.000Z' });
    await resolveAccountDeletion(confirm.deps, { token: 't', action: 'confirm' });
    const cancel = resolving({ status: 'CANCELLED' });
    await resolveAccountDeletion(cancel.deps, { token: 't', action: 'cancel' });
    expect([...confirm.deleted, ...cancel.deleted]).toEqual([]);
  });
});
