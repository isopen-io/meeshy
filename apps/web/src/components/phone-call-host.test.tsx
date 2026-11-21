import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';
import { act } from 'react';

import { PHONE_CALL_SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/phone-call-event-names';

import { CONVERSATIONS_QUERY_KEY } from '@/lib/api/conversations';
import type { SocketClient } from '@/lib/net/socket';
import { phoneCallStateOf } from '@/lib/phone-call/phone-call-live';
import { createPillAnnouncementStore } from '@/lib/view/sync-pill-announcements';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { PhoneCallHost } from './phone-call-host';

/**
 * L'HÔTE D'« EN APPEL » REÇU (#18753) — accroché à la socket vivante, il range l'état servi dans le cache et confie
 * l'annonce à la pastille, nommée par la liste des conversations déjà en cache. Jamais au fil, jamais une notification.
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

const JACQUES = 'b'.repeat(24);

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

const clientWithJacques = (): QueryClient => {
  const client = new QueryClient();
  client.setQueryData(CONVERSATIONS_QUERY_KEY, {
    pages: [{ conversations: [{ id: 'c1', type: 'direct', participants: [{ userId: JACQUES, user: { id: JACQUES, username: 'jacques', displayName: 'Jacques' } }] }] }],
    pageParams: [undefined],
  });
  return client;
};

const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 10)));

/** Attend une CONDITION, pas une durée : sous la charge de la suite complète, le catalogue et l'annonce arrivent plus tard. */
const until = async (ready: () => boolean, timeoutMs = 2_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (!ready() && Date.now() < deadline) await settle();
};

const mountHost = async (client: QueryClient, store: ReturnType<typeof createPillAnnouncementStore>, socket: SocketClient) =>
  mount(<PhoneCallHost client={client} store={store} watch={(watcher) => watcher(socket)} snapshot={async () => ({ ok: true, data: [] })} language={() => 'fr'} />);

const served = () => ({ userId: JACQUES, since: new Date(Date.now() - 600_000).toISOString(), expiresAt: new Date(Date.now() + 3_600_000).toISOString() });

describe('l’hôte d’« en appel »', () => {
  test('un début annoncé : l’état se range, la pastille dit que Jacques est en appel', async () => {
    const client = clientWithJacques();
    const store = createPillAnnouncementStore();
    const { socket, fire } = fakeSocket();
    await mountHost(client, store, socket);
    await act(async () => fire(PHONE_CALL_SERVER_EVENTS.PHONE_CALL_STARTED, { userId: JACQUES, state: served(), announcement: { kind: 'started', at: new Date().toISOString() } }));
    await until(() => store.getState().queue.length > 0);
    expect(phoneCallStateOf(client, JACQUES, Date.now())).not.toBeNull();
    expect(store.getState().queue.map((entry) => [entry.text, entry.tone])).toEqual([['Jacques est en appel', 'good']]);
  });

  test('la fin se dit « Jacques a raccroché », et l’état disparaît', async () => {
    const client = clientWithJacques();
    const store = createPillAnnouncementStore();
    const { socket, fire } = fakeSocket();
    await mountHost(client, store, socket);
    await act(async () => fire(PHONE_CALL_SERVER_EVENTS.PHONE_CALL_STARTED, { userId: JACQUES, state: served() }));
    await act(async () => fire(PHONE_CALL_SERVER_EVENTS.PHONE_CALL_ENDED, { userId: JACQUES, announcement: { kind: 'ended', at: new Date().toISOString() } }));
    await until(() => store.getState().queue.length > 0);
    expect(phoneCallStateOf(client, JACQUES, Date.now())).toBeNull();
    expect(store.getState().queue.map((entry) => entry.text)).toEqual(['Jacques a raccroché']);
  });

  test('sans annonce, rien ne s’affiche dans la pastille', async () => {
    const client = clientWithJacques();
    const store = createPillAnnouncementStore();
    const { socket, fire } = fakeSocket();
    await mountHost(client, store, socket);
    await act(async () => fire(PHONE_CALL_SERVER_EVENTS.PHONE_CALL_STARTED, { userId: JACQUES, state: served() }));
    await settle();
    expect(phoneCallStateOf(client, JACQUES, Date.now())).not.toBeNull();
    expect(store.getState().queue).toEqual([]);
  });
});
