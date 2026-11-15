import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';
import { act } from 'react';

import { PHONE_REACHABILITY_SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/phone-reachability-event-names';

import { CONVERSATIONS_QUERY_KEY } from '@/lib/api/conversations';
import type { SocketClient } from '@/lib/net/socket';
import { phoneReachabilityStateOf } from '@/lib/phone-reachability/phone-reachability-live';
import { createPillAnnouncementStore } from '@/lib/view/sync-pill-announcements';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { PhoneReachabilityHost } from './phone-reachability-host';

/**
 * L'HÔTE DU TÉLÉPHONE INJOIGNABLE REÇU (#18737) — accroché à la socket vivante, il range l'état servi dans le cache
 * et confie l'annonce à la pastille, nommée par la liste des conversations déjà en cache. Jamais au fil.
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

const ADA = 'b'.repeat(24);

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

const clientWithAda = (): QueryClient => {
  const client = new QueryClient();
  client.setQueryData(CONVERSATIONS_QUERY_KEY, {
    pages: [{ conversations: [{ id: 'c1', type: 'direct', participants: [{ userId: ADA, user: { id: ADA, username: 'ada', displayName: 'Ada' } }] }] }],
    pageParams: [undefined],
  });
  return client;
};

const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 10)));

describe('l’hôte du téléphone injoignable', () => {
  test('un téléphone injoignable servi pour la pastille : l’état se range, l’annonce se dit au nom de la personne', async () => {
    const client = clientWithAda();
    const store = createPillAnnouncementStore();
    const { socket, fire } = fakeSocket();
    await mount(<PhoneReachabilityHost client={client} store={store} watch={(watcher) => watcher(socket)} snapshot={async () => ({ ok: true, data: [] })} language={() => 'fr'} />);
    const since = new Date().toISOString();
    await act(async () =>
      fire(PHONE_REACHABILITY_SERVER_EVENTS.PHONE_UNREACHABLE, { userId: ADA, state: { userId: ADA, unreachableSince: since, cause: 'battery' }, announcement: { kind: 'unreachable', at: since } }),
    );
    await settle();
    expect(phoneReachabilityStateOf(client, ADA, Date.now())?.cause).toBe('battery');
    const [said] = store.getState().queue;
    expect(said?.text.startsWith('Ada a un téléphone injoignable depuis ')).toBe(true);
    expect(said?.icon).toEqual({ kind: 'phone', reachable: false });
  });

  test('le retour se dit, et l’état disparaît', async () => {
    const client = clientWithAda();
    const store = createPillAnnouncementStore();
    const { socket, fire } = fakeSocket();
    await mount(<PhoneReachabilityHost client={client} store={store} watch={(watcher) => watcher(socket)} snapshot={async () => ({ ok: true, data: [] })} language={() => 'fr'} />);
    const at = new Date().toISOString();
    await act(async () => fire(PHONE_REACHABILITY_SERVER_EVENTS.PHONE_UNREACHABLE, { userId: ADA, state: { userId: ADA, unreachableSince: at, cause: 'network' } }));
    await act(async () => fire(PHONE_REACHABILITY_SERVER_EVENTS.PHONE_REACHABLE, { userId: ADA, announcement: { kind: 'reachable', at } }));
    await settle();
    expect(phoneReachabilityStateOf(client, ADA, Date.now())).toBeNull();
    expect(store.getState().queue.map((entry) => entry.text)).toEqual(['Ada est de nouveau joignable']);
  });

  test('sans annonce, rien ne s’affiche dans la pastille', async () => {
    const client = clientWithAda();
    const store = createPillAnnouncementStore();
    const { socket, fire } = fakeSocket();
    await mount(<PhoneReachabilityHost client={client} store={store} watch={(watcher) => watcher(socket)} snapshot={async () => ({ ok: true, data: [] })} language={() => 'fr'} />);
    const at = new Date().toISOString();
    await act(async () => fire(PHONE_REACHABILITY_SERVER_EVENTS.PHONE_UNREACHABLE, { userId: ADA, state: { userId: ADA, unreachableSince: at, cause: 'network' } }));
    await settle();
    expect(phoneReachabilityStateOf(client, ADA, Date.now())).not.toBeNull();
    expect(store.getState().queue).toEqual([]);
  });
});
