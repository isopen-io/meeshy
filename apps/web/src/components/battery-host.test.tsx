import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';
import { act } from 'react';

import { BATTERY_SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/battery-event-names';

import { CONVERSATIONS_QUERY_KEY } from '@/lib/api/conversations';
import { batteryStateOf } from '@/lib/battery/battery-live';
import type { SocketClient } from '@/lib/net/socket';
import { createPillAnnouncementStore } from '@/lib/view/sync-pill-announcements';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { BatteryHost } from './battery-host';

/**
 * L'HÔTE DE LA BATTERIE REÇUE (#14147) — accroché à la socket vivante, il range l'état servi dans le cache et
 * confie l'annonce à la pastille, nommée par la liste des conversations déjà en cache. Jamais au fil.
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

describe('l’hôte de la batterie', () => {
  test('un palier servi pour la pastille : l’état se range, l’annonce se dit au nom de la personne', async () => {
    const client = clientWithAda();
    const store = createPillAnnouncementStore();
    const { socket, fire } = fakeSocket();
    await mount(<BatteryHost client={client} store={store} watch={(watcher) => watcher(socket)} snapshot={async () => ({ ok: true, data: [] })} language={() => 'fr'} />);
    const at = new Date().toISOString();
    await act(async () =>
      fire(BATTERY_SERVER_EVENTS.BATTERY_CHANGED, {
        userId: ADA,
        state: { userId: ADA, phase: 'critical', level: 4, charging: false, lowPower: true, measuredAt: at },
        announcement: { kind: 'critical', level: 4, at },
      }),
    );
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
    expect(batteryStateOf(client, ADA, Date.now())?.level).toBe(4);
    expect(store.getState().queue.map((entry) => entry.text)).toEqual(['Ada : batterie critique (4 %)']);
  });

  test('sans annonce, rien ne s’affiche dans la pastille', async () => {
    const client = clientWithAda();
    const store = createPillAnnouncementStore();
    const { socket, fire } = fakeSocket();
    await mount(<BatteryHost client={client} store={store} watch={(watcher) => watcher(socket)} snapshot={async () => ({ ok: true, data: [] })} language={() => 'fr'} />);
    const at = new Date().toISOString();
    await act(async () =>
      fire(BATTERY_SERVER_EVENTS.BATTERY_CHANGED, { userId: ADA, state: { userId: ADA, phase: 'low', level: 20, charging: false, lowPower: false, measuredAt: at } }),
    );
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
    expect(batteryStateOf(client, ADA, Date.now())?.level).toBe(20);
    expect(store.getState().queue).toEqual([]);
  });
});
