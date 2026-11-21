import { afterEach, describe, expect, test } from 'bun:test';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { DIRECT, harness, PEER, type FakeLink } from '@/test-support/call-engine-harness';

import { resetCallTransportForTests } from './call-transport';
import { NETWORK_RECOVERY_COOLDOWN_MS } from './call-network-recovery';

/**
 * UN APPEL SURVIT À UN CHANGEMENT DE RÉSEAU (#19776) — le moteur n'attend plus
 * qu'un ICE « failed » ou un battement manqué (~45 s) découvre la panne : au
 * changement de CHEMIN, la socket est recyclée et chaque lien relance ICE.
 */

afterEach(() => resetCallTransportForTests());

const joined = (userId: string, id: string) => ({ callId: 'call-1', participant: { id, userId, username: userId, displayName: userId } });

const connected = async (request = DIRECT) => {
  const h = harness();
  await h.engine.start(request);
  h.engine.handle(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, joined(PEER, 'p-2'));
  h.linkState(h.links[0] as FakeLink, 'connected');
  return h;
};

describe('changement de réseau pendant un appel', () => {
  test('la socket est recyclée et le lien relance ICE', async () => {
    const h = await connected();
    h.networkPathChanged();
    expect(h.socket.reconnects).toBe(1);
    expect(h.links[0]?.restarts).toBe(1);
  });

  test('en groupe, CHAQUE lien relance ICE', async () => {
    const h = await connected({ ...DIRECT, isGroup: true });
    h.engine.handle(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, joined('u-third', 'p-3'));
    h.networkPathChanged();
    expect(h.links.map((link) => link.restarts)).toEqual([1, 1]);
  });

  test('les signaux d’un même changement ne relancent qu’une fois', async () => {
    const h = await connected();
    h.networkPathChanged();
    h.networkPathChanged();
    expect(h.socket.reconnects).toBe(1);
    h.advance(NETWORK_RECOVERY_COOLDOWN_MS);
    h.networkPathChanged();
    expect(h.socket.reconnects).toBe(2);
  });

  test('un appel qui sonne encore ne relance rien ; un appel raccroché n’écoute plus', async () => {
    const h = harness();
    await h.engine.start(DIRECT);
    h.networkPathChanged();
    expect(h.socket.reconnects).toBe(0);
    h.engine.handle(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, joined(PEER, 'p-2'));
    h.linkState(h.links[0] as FakeLink, 'connected');
    h.engine.hangup();
    h.networkPathChanged();
    expect(h.socket.reconnects).toBe(0);
  });
});
