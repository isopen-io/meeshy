import { describe, expect, test } from 'bun:test';

import { CALL_BACK_GROUP_PARAM, CALL_BACK_NAME_PARAM, CALL_BACK_PARAM } from '@/lib/calls/call-back-intent';

import { mount, push, windowClient } from '@/test-support/sw-push-harness';

/**
 * « RAPPELER » SUR LA NOTIFICATION D'APPEL MANQUÉ (#8067) — la charge est celle
 * de `NotificationService.createMissedCallNotification`, que
 * `callBackPushFields` complète du type d'appel et du libellé localisé.
 */

const missed = (data: Record<string, unknown> = {}) => ({
  notification: { title: 'Awa', body: '📹 Appel vidéo manqué' },
  data: {
    notificationId: 'n-1',
    type: 'missed_call',
    conversationId: 'conv-1',
    conversationType: 'direct',
    conversationTitle: '',
    senderId: 'u-awa',
    senderUsername: 'awa',
    senderDisplayName: 'Awa Diop',
    callType: 'video',
    isVideo: 'true',
    callBackLabel: 'Rappeler',
    ...data,
  },
});

const click = (data: Record<string, unknown>, action = '') => ({
  action,
  notification: { data, close: () => undefined },
});

describe('la notification d’appel manqué porte « Rappeler »', () => {
  test('l’action est offerte, libellée par la passerelle, et la notification sait quoi rappeler', async () => {
    const worker = mount();
    await worker.dispatch('push', push(missed()));
    const options = worker.shown[0]?.options;
    expect(options?.['actions']).toEqual([{ action: 'call-back', title: 'Rappeler' }]);
    expect(options?.['data']).toMatchObject({
      conversationId: 'conv-1',
      callBack: { conversationId: 'conv-1', media: 'video', title: 'Awa Diop', isGroup: false },
    });
  });

  test('un appel de groupe se rappelle dans le groupe, nommé par lui', async () => {
    const worker = mount();
    await worker.dispatch('push', push(missed({ conversationType: 'group', conversationTitle: 'Équipe', callType: 'audio' })));
    expect(worker.shown[0]?.options['data']).toMatchObject({
      callBack: { conversationId: 'conv-1', media: 'audio', title: 'Équipe', isGroup: true },
    });
  });

  test('sans libellé servi, sans conversation, ou pour une autre notification : aucune action', async () => {
    const worker = mount();
    await worker.dispatch('push', push(missed({ notificationId: 'n-2', callBackLabel: '' })));
    await worker.dispatch('push', push(missed({ notificationId: 'n-3', type: 'new_message' })));
    expect(worker.shown.map((shown) => shown.options['actions'])).toEqual([undefined, undefined]);
    expect(worker.shown.map((shown) => (shown.options['data'] as Record<string, unknown>)['callBack'])).toEqual([undefined, undefined]);
  });
});

describe('toucher « Rappeler »', () => {
  const callBack = { conversationId: 'conv-1', media: 'video', title: 'Awa Diop', isGroup: false };

  test('aucun onglet ouvert : ouvre le fil avec l’appel à composer', async () => {
    const worker = mount();
    await worker.dispatch('notificationclick', click({ type: 'missed_call', conversationId: 'conv-1', callBack }, 'call-back'));
    const query = new URLSearchParams({ [CALL_BACK_PARAM]: 'video', [CALL_BACK_NAME_PARAM]: 'Awa Diop' }).toString();
    expect(worker.opened).toEqual([`/c/conv-1?${query}`]);
  });

  test('un groupe le dit dans l’adresse', async () => {
    const worker = mount();
    await worker.dispatch(
      'notificationclick',
      click({ type: 'missed_call', conversationId: 'conv-1', callBack: { ...callBack, title: 'Équipe', isGroup: true } }, 'call-back'),
    );
    expect(new URL(worker.opened[0] ?? '', 'https://meeshy.me').searchParams.get(CALL_BACK_GROUP_PARAM)).toBe('1');
  });

  test('onglet déjà ouvert : il est focalisé et reçoit l’appel à composer', async () => {
    const client = windowClient('hidden');
    const worker = mount({ clients: [client] });
    const data = { type: 'missed_call', conversationId: 'conv-1', callBack };
    await worker.dispatch('notificationclick', click(data, 'call-back'));
    expect(client.focused).toBe(true);
    expect(client.messages).toEqual([{ type: 'NOTIFICATION_CLICKED', url: '/c/conv-1', data, callBack }]);
  });

  test('le corps de la notification ouvre le fil sans composer', async () => {
    const worker = mount();
    await worker.dispatch('notificationclick', click({ type: 'missed_call', conversationId: 'conv-1', callBack }));
    expect(worker.opened).toEqual(['/c/conv-1']);
  });
});
