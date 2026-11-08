import { describe, expect, test } from 'bun:test';

import { TALKIE_AUDIO_PARAM, TALKIE_PARAM, TALKIE_WAKE_MESSAGE } from '@/lib/talkie/talkie-wake-intent';
import { CODE, mount, push, windowClient } from '@/test-support/sw-push-harness';

/**
 * LE TALKIE D'URGENCE, ONGLET FERMÉ (#17144) — `talkie_incoming` dit « X vous
 * parle » ; la toucher rouvre l'app sur le talkie ; « Écouter » fait jouer la
 * voix. C'est la SEULE notification qui porte une action de lecture (directive
 * porteur du 2026-11-08) : le témoin du bas le vérifie sur tous les autres types.
 */

const TALKIE_ID = 'c'.repeat(24);
const AUDIO = 'https://gate.meeshy.me/talkie/c.aac';
const LISTEN = 'talkie-listen';

const incoming = (overrides: Record<string, unknown> = {}) => ({
  data: { type: 'talkie_incoming', talkieId: TALKIE_ID, fromUserId: 'u-ada', fromName: 'Ada', title: 'Ada vous parle', ...overrides },
});

const click = (data: Record<string, unknown>, action = '') => ({ action, notification: { data, close: () => undefined } });

describe('un talkie d’urgence s’annonce quand personne ne regarde', () => {
  test('la notification dit qui parle, reste, et porte « Écouter »', async () => {
    const worker = mount();
    await worker.dispatch('push', push(incoming({ audioUrl: AUDIO })));
    expect(worker.shown).toHaveLength(1);
    expect(worker.shown[0]?.title).toBe('Ada vous parle');
    expect(worker.shown[0]?.options).toMatchObject({
      tag: `talkie:${TALKIE_ID}`,
      requireInteraction: true,
      data: { type: 'talkie_incoming', talkieId: TALKIE_ID, audioUrl: AUDIO },
    });
    expect((worker.shown[0]?.options['actions'] as { action: string }[]).map((a) => a.action)).toEqual([LISTEN]);
  });

  test('sans titre servi, le nom de l’émetteur compose le titre', async () => {
    const worker = mount();
    await worker.dispatch('push', push(incoming({ title: '' })));
    expect(worker.shown[0]?.title.startsWith('Ada')).toBe(true);
  });

  test('un audio qui n’est pas en HTTPS ne voyage pas avec la notification', async () => {
    const worker = mount();
    await worker.dispatch('push', push(incoming({ audioUrl: 'http://evil.example/a.aac' })));
    expect(worker.shown[0]?.options['data']).toEqual({ type: 'talkie_incoming', talkieId: TALKIE_ID, audioUrl: '' });
  });

  test('un onglet visible l’entend déjà : aucune notification (D-11)', async () => {
    const worker = mount({ clients: [windowClient('visible')] });
    await worker.dispatch('push', push(incoming()));
    expect(worker.shown).toEqual([]);
  });

  test('sans prise de parole ni émetteur, rien ne s’annonce', async () => {
    const worker = mount();
    await worker.dispatch('push', push(incoming({ talkieId: '' })));
    await worker.dispatch('push', push(incoming({ fromUserId: '' })));
    expect(worker.shown).toEqual([]);
  });
});

describe('toucher la notification du talkie', () => {
  test('aucun onglet : l’app s’ouvre sur le talkie', async () => {
    const worker = mount();
    await worker.dispatch('notificationclick', click({ type: 'talkie_incoming', talkieId: TALKIE_ID, audioUrl: AUDIO }));
    expect(worker.opened).toEqual([`/notifications?${TALKIE_PARAM}=${TALKIE_ID}`]);
  });

  test('un onglet ouvert est focalisé et rattrape la voix', async () => {
    const client = windowClient('hidden');
    const worker = mount({ clients: [client] });
    await worker.dispatch('notificationclick', click({ type: 'talkie_incoming', talkieId: TALKIE_ID }));
    expect(client.focused).toBe(true);
    expect(client.messages).toEqual([{ type: TALKIE_WAKE_MESSAGE, talkieId: TALKIE_ID }]);
  });

  test('« Écouter » fait jouer l’onglet ouvert SANS le mettre au premier plan', async () => {
    const client = windowClient('hidden');
    const worker = mount({ clients: [client] });
    await worker.dispatch('notificationclick', click({ type: 'talkie_incoming', talkieId: TALKIE_ID, audioUrl: AUDIO }, LISTEN));
    expect(client.focused).toBe(false);
    expect(client.messages).toEqual([{ type: TALKIE_WAKE_MESSAGE, talkieId: TALKIE_ID, audioUrl: AUDIO }]);
  });

  test('« Écouter » sans onglet ouvre l’app avec l’audio du push', async () => {
    const worker = mount();
    await worker.dispatch('notificationclick', click({ type: 'talkie_incoming', talkieId: TALKIE_ID, audioUrl: AUDIO }, LISTEN));
    expect(worker.opened).toEqual([`/notifications?${TALKIE_PARAM}=${TALKIE_ID}&${TALKIE_AUDIO_PARAM}=${encodeURIComponent(AUDIO)}`]);
  });
});

describe('TÉMOIN : seule la notification du talkie porte une action de lecture', () => {
  const others = [
    { data: { type: 'new_message', notificationId: 'n1', conversationId: 'conv-1', title: 'Ada', body: 'Salut', audioUrl: AUDIO } },
    { data: { type: 'call', callId: 'call-1', conversationId: 'conv-1', title: 'Ada vous appelle', answerLabel: 'Répondre', declineLabel: 'Refuser' } },
    { data: { type: 'bring', bringId: 'b1', fromUserId: 'u-ada', title: 'Ada vous Bring' } },
    { data: { type: 'missed_call', notificationId: 'n2', conversationId: 'conv-1', title: 'Appel manqué', body: 'Ada' } },
    { data: { type: 'voice_message', notificationId: 'n3', conversationId: 'conv-1', title: 'Ada', body: '🎤 Message vocal', audioUrl: AUDIO } },
  ];

  test('aucune autre notification ne propose « Écouter »', async () => {
    const worker = mount();
    for (const payload of others) await worker.dispatch('push', push(payload));
    expect(worker.shown.length).toBeGreaterThan(0);
    const actions = worker.shown.flatMap((shown) => ((shown.options['actions'] as { action: string }[] | undefined) ?? []).map((a) => a.action));
    expect(actions).not.toContain(LISTEN);
  });

  test('l’action d’écoute n’est posée que par l’annonce du talkie', () => {
    const uses = CODE.split('TALKIE_LISTEN_ACTION').length - 1;
    expect(uses).toBe(3);
    expect(CODE).toMatch(/actions: \[\{ action: TALKIE_LISTEN_ACTION,/);
  });
});
