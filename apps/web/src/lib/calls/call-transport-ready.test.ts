import { afterEach, describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import type { SocketClient } from '@/lib/net/socket';

import { bridgeCallEvents } from './call-socket-bridge';
import { bindCallTransport, resetCallTransportForTests, whenCallTransportReady, type CallTransport } from './call-transport';

/**
 * UN APPEL NE PART QUE SUR UNE CONNEXION AUTHENTIFIÉE (#8199) — un onglet
 * ouvert à froid par le worker compose avant que le socket soit prêt :
 * l'intention attend la première authentification.
 */

const fakeTransport = (connected: () => boolean): CallTransport => ({
  connected,
  emit: () => undefined,
  request: async () => null,
});

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const track = (promise: Promise<void>) => {
  const state = { done: false };
  void promise.then(() => {
    state.done = true;
  });
  return state;
};

afterEach(() => resetCallTransportForTests());

describe('attendre la connexion d’appel', () => {
  test('sans connexion, l’attente dure ; elle se résout à la première authentification', async () => {
    const waiting = track(whenCallTransportReady());
    await settle();
    expect(waiting.done).toBe(false);

    const binding = bindCallTransport(fakeTransport(() => true));
    await settle();
    expect(waiting.done).toBe(false);

    binding.authenticated();
    await settle();
    expect(waiting.done).toBe(true);
  });

  test('une connexion déjà authentifiée répond aussitôt', async () => {
    bindCallTransport(fakeTransport(() => true)).authenticated();
    const ready = track(whenCallTransportReady());
    await settle();
    expect(ready.done).toBe(true);
  });

  test('une connexion tombée depuis son authentification fait attendre la suivante', async () => {
    const link = { up: true };
    bindCallTransport(fakeTransport(() => link.up)).authenticated();
    link.up = false;
    const waiting = track(whenCallTransportReady());
    await settle();
    expect(waiting.done).toBe(false);

    link.up = true;
    bindCallTransport(fakeTransport(() => true)).authenticated();
    await settle();
    expect(waiting.done).toBe(true);
  });

  test('une connexion détachée n’est plus prête', async () => {
    const binding = bindCallTransport(fakeTransport(() => true));
    binding.authenticated();
    binding.detach();
    const waiting = track(whenCallTransportReady());
    await settle();
    expect(waiting.done).toBe(false);
  });
});

const fakeSocket = (connected: boolean) => {
  const handlers = new Map<string, Array<(payload: unknown) => void>>();
  const socket: SocketClient = {
    connected,
    connect: () => undefined,
    disconnect: () => undefined,
    on: (event, handler) => void handlers.set(event, [...(handlers.get(event) ?? []), handler as (payload: unknown) => void]),
    off: () => undefined,
    emit: () => undefined,
  };
  return { socket, fire: (event: string) => (handlers.get(event) ?? []).forEach((handler) => handler({})) };
};

describe('le pont du socket annonce la connexion prête', () => {
  test('à l’authentification reçue du serveur', async () => {
    const { socket, fire } = fakeSocket(false);
    bridgeCallEvents(socket);
    const waiting = track(whenCallTransportReady());
    await settle();
    expect(waiting.done).toBe(false);

    fire(SERVER_EVENTS.AUTHENTICATED);
    await settle();
    expect(waiting.done).toBe(true);
  });

  test('un socket déjà authentifié avant que le pont se pose (bouchon de fixtures) est tenu pour prêt', async () => {
    bridgeCallEvents(fakeSocket(true).socket);
    const ready = track(whenCallTransportReady());
    await settle();
    expect(ready.done).toBe(true);
  });
});
