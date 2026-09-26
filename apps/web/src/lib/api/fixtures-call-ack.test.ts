import { describe, expect, test } from 'bun:test';
import { CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { decodeAck } from '@/lib/calls/call-decode';

import { fixtureCallAck } from './fixtures-call-ack';
import { createFixturesSocketClient } from './fixtures-realtime';

/**
 * Le bouchon de socket accuse les appels comme la passerelle : un appel lancé
 * sur les fixtures reste VIVANT (il sonne), au lieu d'échouer à l'`initiate`.
 */
describe('fixtureCallAck', () => {
  test('`initiate` rend un identifiant d’appel propre à la conversation', () => {
    const ack = decodeAck(fixtureCallAck(CLIENT_EVENTS.CALL_INITIATE, { conversationId: 'c-kwame', type: 'audio' }));
    expect(ack).toMatchObject({ ok: true, data: { callId: 'call-fixture-c-kwame' } });
  });

  test('`join` rend une session sans autre membre', () => {
    expect(decodeAck(fixtureCallAck(CLIENT_EVENTS.CALL_JOIN, { callId: 'x' }))).toMatchObject({ ok: true, data: { callSession: { participants: [] } } });
  });

  test('le client de fixtures sait accuser', async () => {
    const client = createFixturesSocketClient({ base: 'https://fixtures.invalid', auth: { token: 'fixtures', sessionToken: 'fixtures' } });
    expect(decodeAck(await client.emitWithAck?.(CLIENT_EVENTS.CALL_INITIATE, { conversationId: 'c-1' }, 1000)).ok).toBe(true);
  });
});
