import { describe, expect, test } from 'bun:test';

import { TALKIE_MAX_DURATION_MS } from '@meeshy/shared/types/talkie-constants';
import { TALKIE_SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/talkie-event-names';

import { bindTalkieSender } from './talkie-sender';
import { fakeCapture, harness, PROCHE, settle, TALKIE_ID } from './talkie-sender.test-support';

/**
 * LA COPIE VOCALE DU TALKIE (#16698, iso `TalkieSender.swift`, précision porteur #17141) — un talkie qui ne passe pas
 * n'est pas une erreur : la voix continue de s'enregistrer tant que le doigt tient, puis part en message vocal. Une voix
 * réveillée que personne n'a rejointe (`joined: false`) part aussi en copie. Une voix entendue en direct, jamais.
 */

const CONVERSATION = '64b0000000000000000000c1';
const refusedVoice = (conversationId?: string) => () =>
  Promise.resolve({ success: false, error: 'x', code: 'TALKIE_FALLBACK_VOICE', ...(conversationId === undefined ? {} : { conversationId }) });
const wakingAck = () => Promise.resolve({ success: true, data: { talkieId: TALKIE_ID, maxDurationMs: 30_000, maxChunkBytes: 16_384, delivery: 'waking' } });
const endedFor = (joined?: boolean) => ({
  talkieId: TALKIE_ID,
  fromUserId: 'me',
  toUserId: PROCHE,
  reason: 'sender',
  endedAt: '2026-11-13T10:00:30.000Z',
  ...(joined === undefined ? {} : { joined }),
});

describe('un talkie refusé devient un message vocal', () => {
  test('le repli garde le micro ouvert, dit « enregistrement », et la voix part à la conversation nommée au relâcher', async () => {
    const h = harness({ ack: refusedVoice(CONVERSATION) });
    h.sender.press(PROCHE);
    h.capture.push(2, 100, 40);
    await settle();
    await settle();
    expect(h.sender.store.getState().phase).toEqual({ kind: 'recording-copy', toUserId: PROCHE });
    expect(h.capture.stopped()).toBe(0);
    h.capture.push(3, 100, 40);
    await h.sender.release();
    expect(h.capture.stopped()).toBe(1);
    expect(h.copies).toHaveLength(1);
    expect(h.copies[0]?.toUserId).toBe(PROCHE);
    expect(h.copies[0]?.conversationId).toBe(CONVERSATION);
    expect(h.copies[0]?.frames).toHaveLength(5);
    expect(h.copies[0]?.durationMs).toBe(200);
    expect(h.outcomes).toEqual(['voice']);
    expect(h.sender.store.getState().phase).toEqual({ kind: 'idle' });
  });

  test('un blocage se rend comme un repli : même enregistrement, même issue, rien ne le distingue', async () => {
    const h = harness({ ack: () => Promise.resolve({ success: false, error: 'x', code: 'TALKIE_BLOCKED' }) });
    h.sender.press(PROCHE);
    await settle();
    await settle();
    h.capture.push(2);
    await h.sender.release();
    expect(h.copies[0]?.conversationId).toBeNull();
    expect(h.outcomes).toEqual(['voice']);
  });

  test('un identifiant de conversation illisible n’est pas suivi : le client choisit', async () => {
    const h = harness({ ack: refusedVoice('pas-un-id') });
    h.sender.press(PROCHE);
    await settle();
    await settle();
    h.capture.push(1);
    await h.sender.release();
    expect(h.copies[0]?.conversationId).toBeNull();
  });

  test('relâché AVANT le refus : la voix déjà captée part tout de suite, sans attendre', async () => {
    let refuse: (value: unknown) => void = () => undefined;
    const h = harness({ ack: () => new Promise((resolve) => (refuse = resolve)) });
    h.sender.press(PROCHE);
    await settle();
    h.capture.push(4);
    await h.sender.release();
    refuse({ success: false, error: 'x', code: 'TALKIE_FALLBACK_VOICE' });
    await settle();
    await settle();
    expect(h.copies).toHaveLength(1);
    expect(h.copies[0]?.frames).toHaveLength(4);
    expect(h.outcomes).toEqual(['voice']);
  });

  test('l’enregistrement de repli se ferme seul à la durée maximale du talkie', async () => {
    const h = harness({ ack: refusedVoice() });
    h.sender.press(PROCHE);
    await settle();
    await settle();
    h.capture.push(2);
    expect(h.timers.at(-1)?.ms).toBe(TALKIE_MAX_DURATION_MS);
    h.fireTimers();
    await settle();
    expect(h.copies).toHaveLength(1);
    expect(h.sender.store.getState().phase).toEqual({ kind: 'idle' });
  });

  test('une copie qui ne part pas se dit en échec', async () => {
    const h = harness({ ack: refusedVoice(), copied: false });
    h.sender.press(PROCHE);
    await settle();
    await settle();
    h.capture.push(2);
    await h.sender.release();
    expect(h.outcomes).toEqual(['failed']);
  });

  test('un repli sans micro : rien à copier, le micro refusé se dit', async () => {
    const h = harness({ ack: refusedVoice(), capture: fakeCapture({ fails: true }) });
    h.sender.press(PROCHE);
    await settle();
    await settle();
    expect(h.copies).toEqual([]);
    expect(h.outcomes).toEqual(['mic-denied']);
  });

  test('les autres refus ne copient rien', async () => {
    const h = harness({ ack: () => Promise.resolve({ success: false, error: 'x', code: 'TALKIE_RATE_LIMITED' }) });
    h.sender.press(PROCHE);
    await settle();
    await settle();
    h.capture.push(3);
    await h.sender.release();
    expect(h.copies).toEqual([]);
    expect(h.outcomes).toEqual(['rate-limited']);
  });
});

describe('une voix réveillée que personne n’a rejointe devient un message vocal', () => {
  test('`joined: false` : ce qui est parti en direct part aussi en copie, dans la conversation la plus récente', async () => {
    const h = harness({ ack: wakingAck });
    bindTalkieSender({ socket: h.wire.socket, sender: h.sender });
    h.sender.press(PROCHE);
    await settle();
    h.capture.push(7);
    await h.sender.release();
    expect(h.copies).toEqual([]);
    h.wire.fire(TALKIE_SERVER_EVENTS.TALKIE_ENDED, endedFor(false));
    await settle();
    expect(h.copies).toHaveLength(1);
    expect(h.copies[0]?.frames).toHaveLength(7);
    expect(h.copies[0]?.conversationId).toBeNull();
    expect(h.outcomes).toEqual(['voice']);
  });

  test('`joined: true` : le destinataire l’a entendue, aucune copie', async () => {
    const h = harness({ ack: wakingAck });
    bindTalkieSender({ socket: h.wire.socket, sender: h.sender });
    h.sender.press(PROCHE);
    await settle();
    h.capture.push(7);
    await h.sender.release();
    h.wire.fire(TALKIE_SERVER_EVENTS.TALKIE_ENDED, endedFor(true));
    await settle();
    expect(h.copies).toEqual([]);
    expect(h.outcomes).toEqual([]);
  });

  test('le verdict arrive pendant que le micro s’arrête encore : il attend la voix, il ne se perd pas', async () => {
    let stopMic: () => void = () => undefined;
    const capture = fakeCapture({ slowStop: (done) => (stopMic = done) });
    const h = harness({ ack: wakingAck, capture });
    bindTalkieSender({ socket: h.wire.socket, sender: h.sender });
    h.sender.press(PROCHE);
    await settle();
    h.capture.push(7);
    const released = h.sender.release();
    h.wire.fire(TALKIE_SERVER_EVENTS.TALKIE_ENDED, endedFor(false));
    await settle();
    stopMic();
    await released;
    await settle();
    expect(h.copies).toHaveLength(1);
    expect(h.copies[0]?.frames).toHaveLength(7);
  });

  test('une voix entendue en direct ne laisse jamais de copie', async () => {
    const h = harness();
    bindTalkieSender({ socket: h.wire.socket, sender: h.sender });
    h.sender.press(PROCHE);
    await settle();
    h.capture.push(7);
    await h.sender.release();
    h.wire.fire(TALKIE_SERVER_EVENTS.TALKIE_ENDED, endedFor(false));
    await settle();
    expect(h.copies).toEqual([]);
  });
});
