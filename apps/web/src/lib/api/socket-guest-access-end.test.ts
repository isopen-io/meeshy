import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { conversationStore } from '@/lib/conversation-store';
import type { SocketClient, SocketFactory, SocketHandler } from '@/lib/net/socket';
import { createOutboxStore } from '@/lib/send/outbox-store';

import type { GuestAccessEnd } from './guest-access-end';
import { createRealtimeConnection, type RealtimeDeps } from './socket';
import { createTypingStore } from './typing-store';

/**
 * **LA SOCKET D'UN INVITÉ AU LIEN EXPIRÉ NE SE RECONNECTE PLUS** (#10442) —
 * la passerelle émet `error { code: SHARE_LINK_EXPIRED }` puis coupe
 * (`AuthHandler._refuseExpiredGuestLink`, #10437). Le client se déconnecte
 * lui-même (une déconnexion CLIENT arrête la reconnexion de socket.io, et le
 * retour du réseau ne la relance plus) et fait finir l'accès de l'invité.
 */

function fakeSocket(): SocketClient & { fire(event: string, payload: unknown): void; readonly connects: () => number } {
  const handlers = new Map<string, Set<SocketHandler>>();
  let connected = false;
  let connects = 0;
  return {
    get connected() {
      return connected;
    },
    connects: () => connects,
    connect: () => {
      connects += 1;
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

function connect() {
  const socket = fakeSocket();
  const socketFactory: SocketFactory = () => socket;
  const ended: GuestAccessEnd[] = [];
  const online = new Set<() => void>();
  const deps: RealtimeDeps = {
    base: 'https://gate.staging.meeshy.me',
    socketFactory,
    queryClient: new QueryClient(),
    typing: createTypingStore(),
    conversationStore,
    outbox: createOutboxStore(),
    viewerId: () => 'anon-1',
    onClearSession: () => undefined,
    onGuestAccessEnded: (reason) => ended.push(reason),
    windowTarget: {
      addEventListener: (_type, listener) => online.add(listener),
      removeEventListener: (_type, listener) => online.delete(listener),
    },
  };
  const connection = createRealtimeConnection({ sessionToken: 'anon_abc' }, deps);
  return { socket, ended, online, destroy: connection.destroy };
}

describe('`error { code: SHARE_LINK_EXPIRED }` — la session d’invité finit, la socket ne revient pas', () => {
  test('le client se déconnecte et fait finir l’accès', () => {
    const { socket, ended, online, destroy } = connect();
    expect(socket.connected).toBe(true);

    socket.fire(SERVER_EVENTS.ERROR, { message: 'This share link has expired', code: 'SHARE_LINK_EXPIRED' });

    expect(socket.connected).toBe(false);
    expect(ended).toEqual(['expired']);
    const before = socket.connects();
    for (const listener of online) listener();
    expect(socket.connects()).toBe(before);
    destroy();
  });

  test('`error { code: GUEST_ACCESS_REVOKED }` (#10448) — l’invité retiré est déconnecté, l’accès finit « revoked », plus de reconnexion', () => {
    const { socket, ended, online, destroy } = connect();

    socket.fire(SERVER_EVENTS.ERROR, { message: 'Guest access has been revoked', code: 'GUEST_ACCESS_REVOKED' });

    expect(socket.connected).toBe(false);
    expect(ended).toEqual(['revoked']);
    const before = socket.connects();
    for (const listener of online) listener();
    expect(socket.connects()).toBe(before);
    destroy();
  });

  test('une autre erreur de socket ne ferme rien', () => {
    const { socket, ended, destroy } = connect();
    socket.fire(SERVER_EVENTS.ERROR, { message: 'Too many authentication attempts.', code: 'RATE_LIMIT_EXPIRED' });
    socket.fire(SERVER_EVENTS.ERROR, { message: 'Authentication failed' });
    expect(socket.connected).toBe(true);
    expect(ended).toEqual([]);
    destroy();
  });

  test('l’écouteur part avec la connexion', () => {
    const { socket, ended, destroy } = connect();
    destroy();
    socket.fire(SERVER_EVENTS.ERROR, { code: 'SHARE_LINK_EXPIRED' });
    expect(ended).toEqual([]);
  });
});
