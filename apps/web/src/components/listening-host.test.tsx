import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import { NOW_PLAYING_SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/now-playing-event-names';

import type { SocketClient } from '@/lib/net/socket';
import { createListeningStore } from '@/lib/now-playing/listening-live';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ListeningHost } from './listening-host';

/**
 * L'HÔTE DE L'ÉCOUTE REÇUE (#16729) — accroché à la socket vivante, il range ce qui
 * arrive et retire une écoute à son échéance, sans attendre de `cleared`.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll } = createActMounter();

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(() => unmountAll());

function fakeSocket() {
  const handlers = new Map<string, Set<(payload: unknown) => void>>();
  const socket = {
    connected: true,
    connect: () => undefined,
    disconnect: () => undefined,
    emit: () => undefined,
    on: (event: string, handler: (payload: unknown) => void) => void handlers.set(event, (handlers.get(event) ?? new Set()).add(handler)),
    off: (event: string, handler: (payload: unknown) => void) => void handlers.get(event)?.delete(handler),
  } as unknown as SocketClient;
  return { socket, fire: (event: string, payload: unknown) => handlers.get(event)?.forEach((handler) => handler(payload)) };
}

describe('l’hôte de l’écoute', () => {
  test('une écoute reçue s’éteint seule à son échéance', async () => {
    const store = createListeningStore();
    const { socket, fire } = fakeSocket();
    await mount(<ListeningHost store={store} watch={(watcher) => watcher(socket)} snapshot={async () => ({ ok: true, data: [] })} />);
    const updatedAt = new Date().toISOString();
    const expiresAt = new Date(Date.parse(updatedAt) + 40).toISOString();
    await act(async () => fire(NOW_PLAYING_SERVER_EVENTS.NOW_PLAYING_CHANGED, { userId: 'proche', category: 'music', updatedAt, expiresAt }));
    expect(Object.keys(store.getState().byUser)).toEqual(['proche']);
    await act(async () => new Promise((resolve) => setTimeout(resolve, 80)));
    expect(store.getState().byUser).toEqual({});
  });
});
