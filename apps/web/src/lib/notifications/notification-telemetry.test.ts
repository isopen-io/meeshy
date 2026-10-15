import { describe, expect, test } from 'bun:test';

import type { SocialEventV2Input } from '@/lib/api/social-events-v2-types';
import { banner, mount, push, windowClient } from '@/test-support/sw-push-harness';

import { drainNotificationTelemetry, type IdbFactoryLike } from './notification-telemetry';

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
