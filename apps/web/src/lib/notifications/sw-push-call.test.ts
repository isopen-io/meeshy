import { describe, expect, test } from 'bun:test';

import { CALL_ANSWER_PARAM, ANSWER_INTENT_TTL_MS } from '@/lib/calls/call-answer-intent';
import { CALL_INTENT_DB_NAME, CALL_INTENT_STORE_NAME, consumeCallAnswerConfirmation } from '@/lib/calls/call-answer-confirmation';

import type { DeliveryReceiptCredential } from './delivery-receipt-credential';
import { mount, push, windowClient } from '@/test-support/sw-push-harness';

/**
 * L'APPEL ENTRANT, ONGLET FERMÉ (#8043).
 *
 * Critère de l'issue : un appel iOS → web fait apparaître la notification,
 * Répondre ouvre l'appel, l'annulation de l'appelant la retire. La charge est
 * celle que compose la passerelle (`call-incoming-push.ts`) après son passage
 * FCM data-only (`sendViaFCM` : `title` / `body` rejoignent `data`).
 */

const incoming = (overrides: Record<string, unknown> = {}) => ({
  data: {
    type: 'call',
    callId: 'call-1',
    conversationId: 'conv-1',
    callerName: 'Awa',
    callerUserId: 'u-awa',
    callerAvatar: 'https://gate.meeshy.me/avatar.png',
    isVideo: 'false',
    iceServers: '[]',
    answerLabel: 'Répondre',
    declineLabel: 'Refuser',
    title: 'Awa vous appelle',
    body: 'Appel audio entrant',
    ...overrides,
  },
});

const closing = (type: string, callId = 'call-1') => ({ data: { type, callId } });

const click = (data: Record<string, unknown>, action = '') => ({
  action,
  notification: { data, close: () => undefined },
});

const registered: DeliveryReceiptCredential = {
  credential: { kind: 'registered', token: 'jwt-1' },
  apiBase: 'https://gate.meeshy.me',
};

describe('un appel entrant sonne en notification quand personne ne regarde', () => {
  test('la notification porte le titre servi, Répondre / Refuser, et reste affichée', async () => {
    const worker = mount();
    await worker.dispatch('push', push(incoming()));
    expect(worker.shown).toHaveLength(1);
    const [shown] = worker.shown;
    expect(shown?.title).toBe('Awa vous appelle');
    expect(shown?.options).toMatchObject({
      body: 'Appel audio entrant',
      tag: 'call:call-1',
      requireInteraction: true,
      renotify: true,
      actions: [
        { action: 'answer', title: 'Répondre' },
        { action: 'decline', title: 'Refuser' },
      ],
    });
  });

  test('un onglet visible sonne déjà par le socket : aucune notification (D-11)', async () => {
    const worker = mount({ clients: [windowClient('visible')] });
    await worker.dispatch('push', push(incoming()));
    expect(worker.shown).toEqual([]);
  });

  test('la notification n’emporte ni l’avatar ni les serveurs ICE de la charge', async () => {
    const worker = mount();
    await worker.dispatch('push', push(incoming()));
    expect(worker.shown[0]?.options['data']).toEqual({ type: 'call', callId: 'call-1', conversationId: 'conv-1' });
    expect(JSON.stringify(worker.shown[0]?.options).includes('avatar.png')).toBe(false);
  });

  test('sans identifiant d’appel ni de conversation, rien ne sonne', async () => {
    const worker = mount();
    await worker.dispatch('push', push(incoming({ callId: '' })));
    await worker.dispatch('push', push(incoming({ conversationId: '' })));
    expect(worker.shown).toEqual([]);
  });

  test('l’annulation de l’appelant retire la notification de CET appel, et d’aucun autre', async () => {
    const worker = mount();
    await worker.dispatch('push', push(incoming()));
    await worker.dispatch('push', push(incoming({ callId: 'call-2' })));
    await worker.dispatch('push', push(closing('call_cancel')));
    expect(worker.tray.map((banner) => banner.tag)).toEqual(['call:call-2']);
  });

  test('un décroché sur un autre appareil retire aussi la notification', async () => {
    const worker = mount();
    await worker.dispatch('push', push(incoming()));
    await worker.dispatch('push', push(closing('call_answered_elsewhere')));
    expect(worker.tray).toEqual([]);
  });
});

describe('les actions de la notification d’appel', () => {
  test('Répondre, aucun onglet ouvert : ouvre le fil avec l’appel à décrocher', async () => {
    const worker = mount();
    await worker.dispatch('notificationclick', click({ type: 'call', callId: 'call-1', conversationId: 'conv-1' }, 'answer'));
    /* Composé avec la constante de la PAGE : le jumeau du worker qui dériverait rougit ici. */
    expect(worker.opened).toEqual([`/c/conv-1?${CALL_ANSWER_PARAM}=call-1`]);
  });

  test('Répondre, aucun onglet ouvert : le worker pose la confirmation que SEULE la page lira, avant d’ouvrir l’onglet (#18907)', async () => {
    const worker = mount();
    const before = Date.now();
    await worker.dispatch('notificationclick', click({ type: 'call', callId: 'call-1', conversationId: 'conv-1' }, 'answer'));
    const posted = worker.idb.peek(CALL_INTENT_DB_NAME, CALL_INTENT_STORE_NAME, 'call-1') as { callId: string; until: number };
    expect(posted.callId).toBe('call-1');
    expect(posted.until).toBeGreaterThanOrEqual(before + ANSWER_INTENT_TTL_MS);
    expect(posted.until).toBeLessThanOrEqual(Date.now() + ANSWER_INTENT_TTL_MS);
    /* La moitié « page » lit CE QUE le worker a écrit : le jumeau qui dériverait rougit ici. */
    expect(await consumeCallAnswerConfirmation({ callId: 'call-1', now: Date.now(), indexedDB: worker.idb as unknown as IDBFactory })).toBe(true);
  });

  test('Répondre, aucun onglet ouvert : une IndexedDB qui tarde ne retient pas l’ouverture de l’onglet au-delà de la fenêtre du clic (#18907)', async () => {
    const worker = mount({ indexedDBStalls: true });
    void worker.dispatch('notificationclick', click({ type: 'call', callId: 'call-1', conversationId: 'conv-1' }, 'answer'));
    /* Firefox n'autorise `openWindow` qu'environ une seconde après le clic : la confirmation ne doit jamais coûter l'onglet. */
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(worker.opened).toEqual([`/c/conv-1?${CALL_ANSWER_PARAM}=call-1`]);
  });

  test('Répondre, onglet déjà ouvert : rien n’est posé, le message du worker suffit', async () => {
    const worker = mount({ clients: [windowClient('hidden')] });
    await worker.dispatch('notificationclick', click({ type: 'call', callId: 'call-1', conversationId: 'conv-1' }, 'answer'));
    expect(worker.idb.peek(CALL_INTENT_DB_NAME, CALL_INTENT_STORE_NAME, 'call-1')).toBeUndefined();
  });

  test('le corps de la notification, onglet fermé, ne pose aucune confirmation de décrochage', async () => {
    const worker = mount();
    await worker.dispatch('notificationclick', click({ type: 'call', callId: 'call-1', conversationId: 'conv-1' }, ''));
    expect(worker.idb.peek(CALL_INTENT_DB_NAME, CALL_INTENT_STORE_NAME, 'call-1')).toBeUndefined();
  });

  test('Répondre, onglet déjà ouvert : il est focalisé et reçoit l’appel à décrocher', async () => {
    const client = windowClient('hidden');
    const worker = mount({ clients: [client] });
    await worker.dispatch('notificationclick', click({ type: 'call', callId: 'call-1', conversationId: 'conv-1' }, 'answer'));
    expect(client.focused).toBe(true);
    expect(client.messages).toEqual([
      { type: 'NOTIFICATION_CLICKED', url: '/c/conv-1', data: { type: 'call', callId: 'call-1', conversationId: 'conv-1' }, answerCallId: 'call-1' },
    ]);
  });

  test('le corps de la notification ouvre le fil sans décrocher', async () => {
    const worker = mount();
    await worker.dispatch('notificationclick', click({ type: 'call', callId: 'call-1', conversationId: 'conv-1' }));
    expect(worker.opened).toEqual(['/c/conv-1']);
  });

  test('Refuser raccroche sans ouvrir l’application, par le refus REST avant d’avoir rejoint', async () => {
    const worker = mount({ credential: registered });
    await worker.dispatch('notificationclick', click({ type: 'call', callId: 'call-1', conversationId: 'conv-1' }, 'decline'));
    expect(worker.opened).toEqual([]);
    expect(worker.deliveries.map((request) => [request.url, request.init['method'], request.init['headers']])).toEqual([
      ['https://gate.meeshy.me/api/v1/calls/call-1?reason=rejected', 'DELETE', { Authorization: 'Bearer jwt-1' }],
    ]);
  });

  test('Refuser sans session connue n’envoie rien — jamais une requête sans authentification', async () => {
    const worker = mount();
    await worker.dispatch('notificationclick', click({ type: 'call', callId: 'call-1', conversationId: 'conv-1' }, 'decline'));
    expect(worker.deliveries).toEqual([]);
  });

  test('un refus qui échoue au réseau ne lève pas', async () => {
    const worker = mount({ credential: registered, fetchFails: true });
    await worker.dispatch('notificationclick', click({ type: 'call', callId: 'call-1', conversationId: 'conv-1' }, 'decline'));
    expect(worker.deliveries).toHaveLength(1);
  });
});
