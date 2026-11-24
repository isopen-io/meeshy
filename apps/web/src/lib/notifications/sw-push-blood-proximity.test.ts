import { describe, expect, test } from 'bun:test';

import { BLOOD_PROXIMITY_NOTIFICATION_TYPE } from '@meeshy/shared/types/blood-location';

import { mount, push } from '@/test-support/sw-push-harness';

/**
 * **« LINA EST TOUT PRÈS », APP FERMÉE** (#20540) — de bout en bout dans le service worker : le push
 * descend avec le titre et le corps que la passerelle a composés, la bannière emporte `userId` (l'autre
 * Sang, `BLOOD_PROXIMITY_PUSH_DATA_KEYS`) dans sa liste blanche, et le tap ouvre SA carte — jamais son
 * profil, alors que la charge porte aussi `senderUsername`.
 */
const LINA = '65f0c0ffee0000000000a11a';

const proximity = {
  notification: { title: 'Lina est tout près', body: 'À 500 m — touche pour vous voir tous les deux sur la carte' },
  data: { notificationId: 'n-prox', type: BLOOD_PROXIMITY_NOTIFICATION_TYPE, userId: LINA, senderId: LINA, senderUsername: 'lina' },
};

describe('le push de proximité d’un Sang', () => {
  test('la bannière dit ce que le serveur a composé, sans rien recomposer', async () => {
    const worker = mount();
    await worker.dispatch('push', push(proximity));
    expect(worker.tray.map((banner) => [banner.title, banner.body])).toEqual([[proximity.notification.title, proximity.notification.body]]);
  });

  test('toucher la bannière affichée ouvre la carte de l’autre Sang', async () => {
    const worker = mount();
    await worker.dispatch('push', push(proximity));
    const shown = worker.tray[0];
    expect(shown?.data['userId']).toBe(LINA);
    await worker.dispatch('notificationclick', { notification: { data: shown?.data ?? {}, close: () => undefined } });
    expect(worker.opened).toEqual([`/positions?person=${LINA}`]);
  });

  test('un second push de la même notification ne fait pas une seconde bannière', async () => {
    const worker = mount();
    await worker.dispatch('push', push(proximity));
    await worker.dispatch('push', push(proximity));
    expect(worker.tray.length).toBe(1);
  });
});
