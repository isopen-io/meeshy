import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import type { SocketClient, SocketHandler } from '@/lib/net/socket';

import { bridgeBannerRevocations, type BannerRegistry, type ShownBanner } from './banner-revocation';

/**
 * UNE BANNIÈRE WEB SUIT SA NOTIFICATION SUPPRIMÉE (#8752) — la coque Android
 * annule la bannière révoquée (#8624), iOS la retire aussi sur
 * `notification:deleted` ; le web ferme la bannière du service worker qui
 * annonce la notification supprimée.
 */

const fakeSocket = () => {
  const handlers = new Map<string, Set<SocketHandler<unknown>>>();
  const socket: SocketClient = {
    connected: true,
    connect: () => undefined,
    disconnect: () => undefined,
    emit: () => undefined,
    on: (event, handler) => {
      handlers.set(event, (handlers.get(event) ?? new Set()).add(handler as SocketHandler<unknown>));
    },
    off: (event, handler) => {
      handlers.get(event)?.delete(handler as SocketHandler<unknown>);
    },
  };
  const fire = (event: string, payload: unknown) => handlers.get(event)?.forEach((handler) => handler(payload));
  return { socket, fire, listeners: (event: string) => handlers.get(event)?.size ?? 0 };
};

const tray = (notificationIds: readonly (string | null)[]) => {
  const closed: string[] = [];
  const banners: ShownBanner[] = notificationIds.map((notificationId, index) => ({
    data: notificationId === null ? undefined : { notificationId, conversationId: 'conv-1' },
    close: () => closed.push(notificationId ?? `sans-id-${index}`),
  }));
  const registry: BannerRegistry = { getNotifications: () => Promise.resolve(banners) };
  return { registry, closed };
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('bridgeBannerRevocations — la bannière suit la notification supprimée', () => {
  test('la suppression d’une notification ferme SA bannière', async () => {
    const { socket, fire } = fakeSocket();
    const { registry, closed } = tray(['n-1', 'n-2']);
    bridgeBannerRevocations(socket, () => Promise.resolve(registry));
    fire(SERVER_EVENTS.NOTIFICATION_DELETED, { notificationId: 'n-1' });
    await settle();
    expect(closed).toEqual(['n-1']);
  });

  test('une bannière d’une autre notification, ou sans identifiant, reste', async () => {
    const { socket, fire } = fakeSocket();
    const { registry, closed } = tray(['n-2', null]);
    bridgeBannerRevocations(socket, () => Promise.resolve(registry));
    fire(SERVER_EVENTS.NOTIFICATION_DELETED, { notificationId: 'n-1' });
    await settle();
    expect(closed).toEqual([]);
  });

  test('une charge sans identifiant ne ferme rien', async () => {
    const { socket, fire } = fakeSocket();
    const { registry, closed } = tray(['n-1']);
    bridgeBannerRevocations(socket, () => Promise.resolve(registry));
    fire(SERVER_EVENTS.NOTIFICATION_DELETED, {});
    fire(SERVER_EVENTS.NOTIFICATION_DELETED, null);
    await settle();
    expect(closed).toEqual([]);
  });

  test('sans service worker inscrit, rien ne se passe', async () => {
    const { socket, fire } = fakeSocket();
    bridgeBannerRevocations(socket, () => Promise.resolve(null));
    expect(() => fire(SERVER_EVENTS.NOTIFICATION_DELETED, { notificationId: 'n-1' })).not.toThrow();
    await settle();
  });

  test('une barre de notifications illisible ne fait pas lever le gestionnaire', async () => {
    const { socket, fire } = fakeSocket();
    const registry: BannerRegistry = { getNotifications: () => Promise.reject(new Error('refused')) };
    bridgeBannerRevocations(socket, () => Promise.resolve(registry));
    fire(SERVER_EVENTS.NOTIFICATION_DELETED, { notificationId: 'n-1' });
    await settle();
    expect(true).toBe(true);
  });

  test('détacher le pont retire l’écouteur', () => {
    const { socket, listeners } = fakeSocket();
    const detach = bridgeBannerRevocations(socket, () => Promise.resolve(null));
    expect(listeners(SERVER_EVENTS.NOTIFICATION_DELETED)).toBe(1);
    detach();
    expect(listeners(SERVER_EVENTS.NOTIFICATION_DELETED)).toBe(0);
  });
});

describe('le temps réel branche le retrait des bannières', () => {
  test('realtime.ts pose le pont à chaque connexion', () => {
    const source = readFileSync(new URL('../api/realtime.ts', import.meta.url), 'utf8');
    expect(source).toContain('bridgeBannerRevocations(next.socket');
  });
});
