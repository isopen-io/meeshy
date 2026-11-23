import { describe, expect, test } from 'bun:test';

import { TALKIE_MAX_DURATION_MS } from '@meeshy/shared/types/talkie-constants';
import { TALKIE_CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events/talkie-event-names';

import { fakeCapture, harness, PROCHE, settle } from './talkie-sender.test-support';

/**
 * LE TÉLÉPHONE EST INJOIGNABLE : LE MÊME GESTE LAISSE UN MESSAGE VOCAL (#20241, iso `TalkieSender.press(toUserId:delivery:)`
 * en `.voiceMessage`) — aucun `talkie:start` : le micro s'ouvre, la voix s'enregistre tant que le doigt tient, puis
 * part en message vocal dans la conversation DIRECTE. Un simple toucher qui n'a rien capté : rien ne part, rien ne se
 * dit. Micro refusé : on le dit.
 */

describe('laisser un message vocal', () => {
  test('aucune prise de parole n’est ouverte : la voix s’enregistre puis part dans le direct au relâcher', async () => {
    const h = harness();
    h.sender.press(PROCHE, { mode: 'voice-message' });
    expect(h.sender.store.getState().phase).toEqual({ kind: 'recording-copy', toUserId: PROCHE });
    await settle();
    h.capture.push(3, 100, 40);
    await h.sender.release();
    expect(h.wire.emitted.filter((e) => e.event === TALKIE_CLIENT_EVENTS.TALKIE_START)).toEqual([]);
    expect(h.capture.stopped()).toBe(1);
    expect(h.copies).toHaveLength(1);
    expect(h.copies[0]).toMatchObject({ toUserId: PROCHE, conversationId: null, directOnly: true, durationMs: 120 });
    expect(h.copies[0]?.frames).toHaveLength(3);
    expect(h.outcomes).toEqual(['voice']);
    expect(h.sender.store.getState().phase).toEqual({ kind: 'idle' });
  });

  test('sans socket, le message vocal part quand même : il ne passe pas par le talkie', async () => {
    const h = harness({ socketPresent: false });
    h.sender.press(PROCHE, { mode: 'voice-message' });
    await settle();
    h.capture.push(2);
    await h.sender.release();
    expect(h.copies).toHaveLength(1);
    expect(h.outcomes).toEqual(['voice']);
  });

  test('un simple toucher qui n’a rien capté : rien ne part, rien ne se dit', async () => {
    const h = harness();
    h.sender.press(PROCHE, { mode: 'voice-message' });
    await settle();
    await h.sender.release();
    expect(h.copies).toEqual([]);
    expect(h.outcomes).toEqual([]);
    expect(h.sender.store.getState().phase).toEqual({ kind: 'idle' });
  });

  test('un relâcher avant que le micro ne s’ouvre : rien ne part, le micro est refermé', async () => {
    const h = harness();
    h.sender.press(PROCHE, { mode: 'voice-message' });
    await h.sender.release();
    await settle();
    expect(h.copies).toEqual([]);
    expect(h.outcomes).toEqual([]);
    expect(h.sender.store.getState().phase).toEqual({ kind: 'idle' });
  });

  test('micro refusé : on le dit, rien ne part', async () => {
    const h = harness({ capture: fakeCapture({ fails: true }) });
    h.sender.press(PROCHE, { mode: 'voice-message' });
    await settle();
    await settle();
    expect(h.outcomes).toEqual(['mic-denied']);
    expect(h.copies).toEqual([]);
    expect(h.sender.store.getState().phase).toEqual({ kind: 'idle' });
  });

  test('la durée maximale ferme seule l’enregistrement et l’envoie', async () => {
    const h = harness();
    h.sender.press(PROCHE, { mode: 'voice-message' });
    await settle();
    h.capture.push(2);
    expect(h.timers.some((t) => t.ms === TALKIE_MAX_DURATION_MS && !t.cancelled)).toBe(true);
    h.fireTimers();
    await settle();
    await settle();
    expect(h.copies).toHaveLength(1);
    expect(h.outcomes).toEqual(['voice']);
  });

  test('un envoi qui échoue se dit en échec', async () => {
    const h = harness({ copied: false });
    h.sender.press(PROCHE, { mode: 'voice-message' });
    await settle();
    h.capture.push(2);
    await h.sender.release();
    expect(h.outcomes).toEqual(['failed']);
  });

  test('le talkie ordinaire ne change pas : la copie d’un repli n’est pas réservée au direct', async () => {
    const h = harness({ ack: () => Promise.resolve({ success: false, error: 'x', code: 'TALKIE_FALLBACK_VOICE' }) });
    h.sender.press(PROCHE);
    await settle();
    await settle();
    h.capture.push(2);
    await h.sender.release();
    expect(h.copies[0]?.directOnly).toBeUndefined();
  });
});
