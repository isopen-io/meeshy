import { describe, expect, test } from 'bun:test';

import { CODE, mount, push, windowClient } from '@/test-support/sw-push-harness';

import type { DeliveryReceiptCredential } from './delivery-receipt-credential';

/**
 * « TOUT VA BIEN ? », ONGLET FERMÉ (#18738) — `wellness_check` s'affiche et reste, avec l'action « Je vais bien » ;
 * l'action comme le toucher répondent par `POST /api/v1/me/wellness/ok`, au nom du compte enregistré du navigateur.
 * L'action répond sans ouvrir l'app ; le toucher l'ouvre en plus. Aucune autre notification ne porte cette action.
 */

const OK = 'wellness-ok';
const registered: DeliveryReceiptCredential = { credential: { kind: 'registered', token: 'jwt-1' }, apiBase: 'https://gate.meeshy.me' };
const guest: DeliveryReceiptCredential = { credential: { kind: 'anonymous', sessionToken: 'sess-1' }, apiBase: 'https://gate.meeshy.me' };

const asked = { data: { type: 'wellness_check', notificationId: 'a'.repeat(24), title: 'Tout va bien ?', body: 'Aucune activité depuis 12 h. Touchez pour rassurer vos Sangs.' } };

const click = (data: Record<string, unknown>, action = '') => ({ action, notification: { data, close: () => undefined } });

const wellnessCalls = (worker: ReturnType<typeof mount>) => worker.deliveries.filter((call) => call.url.endsWith('/api/v1/me/wellness/ok'));

describe('« Tout va bien ? » s’affiche quand personne ne regarde', () => {
  test('la notification reste, et porte « Je vais bien »', async () => {
    const worker = mount({ credential: registered });
    await worker.dispatch('push', push(asked));
    expect(worker.shown).toHaveLength(1);
    expect(worker.shown[0]?.title).toBe('Tout va bien ?');
    expect(worker.shown[0]?.options['requireInteraction']).toBe(true);
    expect(worker.shown[0]?.options['actions']).toEqual([{ action: OK, title: 'I’m OK' }]);
  });

  test('un onglet visible la reçoit déjà : aucune notification système (D-11)', async () => {
    const worker = mount({ clients: [windowClient('visible')] });
    await worker.dispatch('push', push(asked));
    expect(worker.shown).toEqual([]);
  });
});

describe('répondre « Je vais bien »', () => {
  test('l’action répond par `POST /me/wellness/ok`, sans ouvrir l’app', async () => {
    const worker = mount({ credential: registered });
    await worker.dispatch('notificationclick', click({ type: 'wellness_check', notificationId: 'a'.repeat(24) }, OK));
    expect(wellnessCalls(worker)).toHaveLength(1);
    expect(wellnessCalls(worker)[0]?.url).toBe('https://gate.meeshy.me/api/v1/me/wellness/ok');
    expect(wellnessCalls(worker)[0]?.init).toMatchObject({ method: 'POST', headers: { Authorization: 'Bearer jwt-1' }, keepalive: true });
    expect(worker.opened).toEqual([]);
  });

  test('le toucher répond aussi, et ouvre l’app', async () => {
    const worker = mount({ credential: registered });
    await worker.dispatch('notificationclick', click({ type: 'wellness_check', notificationId: 'a'.repeat(24) }));
    expect(wellnessCalls(worker)).toHaveLength(1);
    expect(worker.opened).toEqual(['/notifications']);
  });

  test('sans compte enregistré, rien ne part : un invité n’a pas de Sang à rassurer', async () => {
    const anonymous = mount({ credential: guest });
    await anonymous.dispatch('notificationclick', click({ type: 'wellness_check' }, OK));
    const none = mount();
    await none.dispatch('notificationclick', click({ type: 'wellness_check' }, OK));
    expect([...wellnessCalls(anonymous), ...wellnessCalls(none)]).toEqual([]);
  });

  test('un réseau en échec ne lève pas', async () => {
    const worker = mount({ credential: registered, fetchFails: true });
    await worker.dispatch('notificationclick', click({ type: 'wellness_check' }, OK));
    expect(worker.deliveries).toHaveLength(1);
  });
});

describe('TÉMOIN : seule « Tout va bien ? » porte « Je vais bien »', () => {
  test('ni un message, ni l’alerte d’inactivité d’un Sang ne la proposent', async () => {
    const worker = mount();
    await worker.dispatch('push', push({ data: { type: 'new_message', notificationId: 'n1', conversationId: 'conv-1', title: 'Ada', body: 'Salut' } }));
    await worker.dispatch('push', push({ data: { type: 'inactivity_alert', notificationId: 'n2', senderUsername: 'jacques', title: 'Jacques n’a pas répondu à « Tout va bien ? »', body: 'Aucune activité depuis 12 h' } }));
    const actions = worker.shown.flatMap((shown) => ((shown.options['actions'] as { action: string }[] | undefined) ?? []).map((a) => a.action));
    expect(actions).not.toContain(OK);
    expect(worker.shown).toHaveLength(2);
  });

  test('l’alerte d’un Sang ouvre son profil', async () => {
    const worker = mount();
    await worker.dispatch('notificationclick', click({ type: 'inactivity_alert', senderUsername: 'jacques' }));
    expect(worker.opened).toEqual(['/u/jacques']);
    expect(CODE).toContain("'inactivity_alert'");
  });
});
