import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { SocialEventV2Input } from '@/lib/api/social-events-v2-types';
import { banner, mount, push, windowClient } from '@/test-support/sw-push-harness';

import type { CoqueNative } from '@/lib/native-shell';

import { drainNotificationTelemetry, drainShellNotificationTelemetry, type IdbFactoryLike } from './notification-telemetry';

/**
 * L'ENTONNOIR DES NOTIFICATIONS (#10507) — le worker écrit, la page vide la
 * file vers la file v2 au démarrage. Les deux moitiés sur la MÊME base : le
 * seul témoin qui rougirait si les noms du jumeau divergeaient.
 */
const NOTIF = '6512bd43d9caa6e02c990b0a';
const POST = '6512bd43d9caa6e02c990b0b';

const drain = async (idb: unknown) => {
  const recorded: SocialEventV2Input[] = [];
  const count = await drainNotificationTelemetry(idb as IdbFactoryLike, (event) => recorded.push(event));
  return { count, recorded };
};

describe('la file du service worker est vidée vers la file v2 au démarrage', () => {
  test('une bannière montrée : received puis displayed, avec la notification et le contenu visé — jamais son texte', async () => {
    const worker = mount();
    await worker.dispatch('push', push(banner({ notificationId: NOTIF, type: 'post_like', postId: POST })));
    const { recorded } = await drain(worker.idb);
    expect(recorded.map((e) => e.action)).toEqual(['received', 'displayed']);
    expect(recorded[0]).toMatchObject({
      type: 'notification',
      target: { kind: 'notification', id: NOTIF, parent: { kind: 'post', id: POST } },
      channel: 'webpush',
      notificationType: 'post_like',
      surface: 'notifications',
    });
    expect(typeof (recorded[0] as { eventId?: unknown }).eventId).toBe('string');
    expect(JSON.stringify(recorded)).not.toContain('Bonjour');
  });

  test('un onglet visible (pas de bannière système) : received seulement', async () => {
    const worker = mount({ clients: [windowClient('visible')] });
    await worker.dispatch('push', push(banner({ notificationId: NOTIF, conversationId: 'abc' })));
    const { recorded } = await drain(worker.idb);
    expect(recorded.map((e) => e.action)).toEqual(['received']);
  });

  test('toucher la bannière : opened ; l’écarter : dismissed', async () => {
    const worker = mount();
    const notification = { data: { notificationId: NOTIF, type: 'post_like' }, close: () => undefined };
    await worker.dispatch('notificationclick', { notification, action: '' });
    await worker.dispatch('notificationclose', { notification });
    const { recorded } = await drain(worker.idb);
    expect(recorded.map((e) => e.action)).toEqual(['opened', 'dismissed']);
  });

  test('vidée UNE fois : un second démarrage ne renvoie rien', async () => {
    const worker = mount();
    await worker.dispatch('push', push(banner({ notificationId: NOTIF })));
    expect((await drain(worker.idb)).count).toBe(2);
    expect((await drain(worker.idb)).count).toBe(0);
  });

  test('une notification sans identifiant lisible n’écrit rien ; sans IndexedDB, rien ne lève', async () => {
    const worker = mount();
    await worker.dispatch('push', push(banner({ notificationId: 'n1' })));
    expect((await drain(worker.idb)).count).toBe(0);
    expect((await drain(undefined)).count).toBe(0);
  });
});

const NOTIFICATION = '65f0a1b2c3d4e5f6a7b8c9d0';

const shellLine = (action: string, overrides: Readonly<Record<string, unknown>> = {}): string =>
  JSON.stringify({
    type: 'notification',
    action,
    eventId: `e-${action}`,
    occurredAt: '2026-10-18T20:30:00.000Z',
    target: { kind: 'notification', id: NOTIFICATION },
    surface: 'notifications',
    channel: 'fcm',
    notificationType: 'new_message',
    ...overrides,
  });

function shell(stored: readonly string[], methods: readonly string[] = ['drainNotificationEvents']) {
  const pending = { lines: [...stored] };
  const calls: string[] = [];
  const coque: CoqueNative = {
    PluginHeaders: [{ name: 'MeeshyNotificationSettings', methods: methods.map((name) => ({ name })) }],
    nativePromise: (plugin, methode) => {
      calls.push(`${plugin}.${methode}`);
      const events = pending.lines;
      pending.lines = [];
      return Promise.resolve({ events });
    },
  };
  return { coque, calls };
}

async function drainShell(coque: CoqueNative | undefined) {
  const recorded: SocialEventV2Input[] = [];
  const count = await drainShellNotificationTelemetry(coque, (event) => recorded.push(event));
  return { count, recorded };
}

describe('#10938 — ce que la coque Android a noté app fermée passe dans la file v2 au démarrage', () => {
  test('une bannière posée par FCM : received puis displayed, sur le canal fcm, avec l’identifiant et l’heure du natif', async () => {
    const { coque, calls } = shell([shellLine('received'), shellLine('displayed')]);
    const { count, recorded } = await drainShell(coque);
    expect(calls).toEqual(['MeeshyNotificationSettings.drainNotificationEvents']);
    expect(count).toBe(2);
    expect(recorded.map((event) => event.action)).toEqual(['received', 'displayed']);
    expect(recorded[0]).toEqual({
      type: 'notification',
      action: 'received',
      eventId: 'e-received',
      occurredAt: '2026-10-18T20:30:00.000Z',
      target: { kind: 'notification', id: NOTIFICATION },
      surface: 'notifications',
      channel: 'fcm',
      notificationType: 'new_message',
    });
  });

  test('vidée UNE fois : un second démarrage ne renvoie rien', async () => {
    const { coque } = shell([shellLine('received')]);
    expect((await drainShell(coque)).count).toBe(1);
    expect((await drainShell(coque)).count).toBe(0);
  });

  test('une ligne illisible, un autre canal ou un autre type d’événement ne passent pas', async () => {
    const { coque } = shell([
      '{pas du json',
      shellLine('received', { channel: 'webpush' }),
      shellLine('received', { type: 'post' }),
      shellLine('displayed'),
    ]);
    const { recorded } = await drainShell(coque);
    expect(recorded.map((event) => event.action)).toEqual(['displayed']);
  });

  test('un navigateur, ou une coque construite avant la méthode : rien n’est appelé, rien ne lève', async () => {
    expect((await drainShell(undefined)).count).toBe(0);
    const ancienne = shell([shellLine('received')], ['open', 'fcmStatus']);
    expect((await drainShell(ancienne.coque)).count).toBe(0);
    expect(ancienne.calls).toEqual([]);
  });

  test('un pont qui rejette ne lève pas', async () => {
    const coque: CoqueNative = {
      PluginHeaders: [{ name: 'MeeshyNotificationSettings', methods: [{ name: 'drainNotificationEvents' }] }],
      nativePromise: () => Promise.reject(new Error('pont fermé')),
    };
    expect((await drainShell(coque)).count).toBe(0);
  });

  test('le démarrage vide la coque à côté du service worker', () => {
    const main = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'main.tsx'), 'utf8');
    expect(main).toContain('drainShellNotificationTelemetry(coqueCourante()');
  });
});
