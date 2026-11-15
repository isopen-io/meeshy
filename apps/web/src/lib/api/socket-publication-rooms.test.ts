import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, test } from 'bun:test';

import { conversationStore } from '@/lib/conversation-store';
import { createOutboxStore } from '@/lib/send/outbox-store';
import { createFakeGatewaySocket, type FakeGatewaySocket } from '@/test-support/fake-gateway-socket';

import { acquirePublicationRoom } from './publication-rooms';
import { createRealtimeConnection, type RealtimeConnection } from './socket';
import { createTypingStore } from './typing-store';

/**
 * LA CONNEXION TIENT LES SALLES QUE LES ÉCRANS DEMANDENT (#7395) — le
 * branchement de `publication-rooms.ts` sur `createRealtimeConnection`, mesuré sur
 * un double de la passerelle qui ne garde un socket dans une salle que s'il
 * l'a rejointe AUTHENTIFIÉ, et l'en sort à la coupure.
 */

let connections: readonly RealtimeConnection[] = [];
let releases: readonly (() => void)[] = [];

afterEach(() => {
  for (const release of releases) release();
  releases = [];
  for (const connection of connections) connection.destroy();
  connections = [];
});

function open(socket: FakeGatewaySocket): RealtimeConnection {
  const connection = createRealtimeConnection(
    { token: 't', sessionToken: 's' },
    {
      base: 'https://gate.staging.meeshy.me',
      socketFactory: () => socket,
      queryClient: new QueryClient(),
      typing: createTypingStore(),
      conversationStore,
      outbox: createOutboxStore(),
      viewerId: () => 'u-viewer',
      onClearSession: () => undefined,
    },
  );
  connections = [...connections, connection];
  return connection;
}

function hold(postId: string): () => void {
  const release = acquirePublicationRoom(postId);
  releases = [...releases, release];
  return release;
}

describe('la connexion et les salles de publication', () => {
  test('une salle demandée AVANT que la connexion existe est rejointe dès la première authentification', () => {
    hold('p1');
    const socket = createFakeGatewaySocket();
    open(socket);
    expect([...socket.rooms()]).toEqual(['post:p1']);
  });

  test('connecté : ouvrir rejoint tout de suite, fermer quitte', () => {
    const socket = createFakeGatewaySocket();
    open(socket);
    const release = hold('p1');
    expect([...socket.rooms()]).toEqual(['post:p1']);
    release();
    expect([...socket.rooms()]).toEqual([]);
    expect(socket.roomEmits()).toEqual([
      ['post:join', 'p1'],
      ['post:leave', 'p1'],
    ]);
  });

  test('coupé : rien ne part (une émission tamponnée arriverait avant l’authentification et serait refusée) ; la réauthentification rejoint', () => {
    const socket = createFakeGatewaySocket();
    open(socket);
    socket.drop();
    hold('p1');
    expect(socket.roomEmits()).toEqual([]);
    socket.connect();
    expect([...socket.rooms()]).toEqual(['post:p1']);
  });

  test('après une coupure, chaque salle tenue est rejointe à nouveau — une fois chacune', () => {
    const socket = createFakeGatewaySocket();
    open(socket);
    hold('a');
    hold('a');
    hold('b');
    socket.drop();
    expect([...socket.rooms()]).toEqual([]);
    socket.connect();
    expect([...socket.rooms()].sort()).toEqual(['post:a', 'post:b']);
    expect(socket.roomEmits().filter(([, id]) => id === 'a')).toHaveLength(2);
  });

  test('une connexion détruite ne parle plus : la suivante reprend les salles tenues', () => {
    const first = createFakeGatewaySocket();
    open(first).destroy();
    connections = [];
    hold('p1');
    expect(first.roomEmits()).toEqual([]);

    const second = createFakeGatewaySocket();
    open(second);
    expect([...second.rooms()]).toEqual(['post:p1']);
  });
});
