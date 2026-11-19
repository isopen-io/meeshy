import { afterEach, describe, expect, test } from 'bun:test';
import { CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { DIRECT, harness } from '@/test-support/call-engine-harness';

import { resetCallTransportForTests } from './call-transport';
import type { EndedCall } from './ended-call-repair';

/**
 * #19778 — rejoindre un appel que le serveur dit FINI (join refusé CALL_ENDED)
 * ne se contente plus de fermer l'écran : le moteur le signale, pour que la
 * carte, la pastille et la ligne de liste cessent aussitôt d'offrir « Rejoindre ».
 */

afterEach(() => resetCallTransportForTests());

const endedAck = { [CLIENT_EVENTS.CALL_JOIN]: { success: false, error: { code: 'CALL_ENDED', message: 'This call has already ended', endReason: 'completed' } } };

describe('un join refusé CALL_ENDED répare ce qui offrait « Rejoindre » (#19778)', () => {
  test('le moteur nomme la conversation et l’appel fini, et l’écran se ferme', async () => {
    const ended: EndedCall[] = [];
    const h = harness({ acks: endedAck, onJoinRefusedEnded: (call) => void ended.push(call) });
    await h.engine.join({ ...DIRECT, callId: 'call-gone' });
    expect(ended).toEqual([{ conversationId: DIRECT.conversationId, callId: 'call-gone' }]);
    expect(h.call()?.phase.kind).toBe('ended');
  });

  test('un autre refus de join ne dit pas l’appel fini', async () => {
    const ended: EndedCall[] = [];
    const h = harness({ acks: { [CLIENT_EVENTS.CALL_JOIN]: { success: false, error: { code: 'NOT_A_PARTICIPANT', message: 'no' } } }, onJoinRefusedEnded: (call) => void ended.push(call) });
    await h.engine.join({ ...DIRECT, callId: 'call-1' });
    expect(ended).toEqual([]);
  });

  test('un join accepté ne signale rien', async () => {
    const ended: EndedCall[] = [];
    const h = harness({ onJoinRefusedEnded: (call) => void ended.push(call) });
    await h.engine.join({ ...DIRECT, callId: 'call-1' });
    expect(ended).toEqual([]);
  });
});
