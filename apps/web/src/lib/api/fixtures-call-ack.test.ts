import { describe, expect, test } from 'bun:test';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { decodeAck } from '@/lib/calls/call-decode';

import { CALL_PEER_FLAG, fixtureCallAck } from './fixtures-call-ack';
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

describe('le pair qui décroche (#8063)', () => {
  const joinedAfterInitiate = async (): Promise<boolean> => {
    const client = createFixturesSocketClient({ base: 'https://fixtures.invalid', auth: { token: 'fixtures', sessionToken: 'fixtures' } });
    let joined = false;
    client.on(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, () => void (joined = true));
    await client.emitWithAck?.(CLIENT_EVENTS.CALL_INITIATE, { conversationId: 'c-1' }, 1000);
    await new Promise((resolve) => setTimeout(resolve, 450));
    client.disconnect();
    return joined;
  };

  test('armé par le gate, un pair rejoint l’appel lancé', async () => {
    /* Ce runtime n'a pas de localStorage : le témoin pose celui d'un navigateur où le gate a armé le pair. */
    Object.assign(globalThis, { localStorage: { getItem: (key: string) => (key === CALL_PEER_FLAG ? '1' : null) } });
    try {
      expect(await joinedAfterInitiate()).toBe(true);
    } finally {
      Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });

  test('sans le drapeau, l’appel continue de sonner : personne ne rejoint', async () => {
    expect(await joinedAfterInitiate()).toBe(false);
  });
});
