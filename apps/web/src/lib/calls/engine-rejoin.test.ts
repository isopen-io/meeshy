import { afterEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CALL_REJOIN_GRACE_MS } from '@meeshy/shared/types/call-rules';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { DIRECT, flush, harness, ME, PEER, type FakeLink } from '@/test-support/call-engine-harness';

import { resetCallTransportForTests } from './call-transport';

/**
 * ON REJOINT UN APPEL EN COURS, L'APPEL NE S'ARRÊTE PAS (#9111) — le moteur ne
 * dit plus `call:end` aux moments où un participant n'a fait que se couper :
 * la fin d'un appel qu'on peut encore rejoindre vient du serveur, après la
 * grâce de reprise (`CALL_REJOIN_GRACE_MS`).
 */

afterEach(() => resetCallTransportForTests());

const joined = (id: string, userId: string) => ({ callId: 'call-1', participant: { id, userId, username: userId, displayName: userId } });

async function connectedDuo() {
  const h = harness();
  await h.engine.start(DIRECT);
  h.engine.handle(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, joined('p-2', PEER));
  h.linkState(h.links[0] as FakeLink, 'connected');
  return h;
}

const ended = (h: Awaited<ReturnType<typeof connectedDuo>>) => [...h.names(h.emitted), ...h.names(h.requested)].includes(CLIENT_EVENTS.CALL_END);

describe('une page quittée ne raccroche pas', () => {
  test('le moteur n’écoute plus pagehide : quitter la page n’émet rien, la grâce du serveur laisse revenir', async () => {
    const h = await connectedDuo();
    expect(ended(h)).toBe(false);
    expect(h.call()?.phase.kind).toBe('connected');
    expect(Object.keys(h.engine)).not.toContain('pageHidden');
    expect(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'engine.ts'), 'utf8')).not.toContain("'pagehide'");
  });
});

describe('un lien perdu en duo devient une reconnexion, pas une fin', () => {
  test('lien « failed » : phase « reconnexion », aucun call:end', async () => {
    const h = await connectedDuo();
    h.linkState(h.links[0] as FakeLink, 'failed');
    expect(h.call()?.phase.kind).toBe('reconnecting');
    expect(ended(h)).toBe(false);
  });

  test('le pair revenu (participant-joined) reçoit une offre neuve et l’appel repart', async () => {
    const h = await connectedDuo();
    h.linkState(h.links[0] as FakeLink, 'failed');
    h.engine.handle(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, joined('p-2b', PEER));
    expect(h.links).toHaveLength(2);
    expect(h.links[1]?.offers).toBe(1);
    h.linkState(h.links[1] as FakeLink, 'connected');
    expect(h.call()?.phase.kind).toBe('connected');
  });

  test('passé la grâce de reprise sans retour, on quitte (call:leave), jamais call:end', async () => {
    const h = await connectedDuo();
    h.linkState(h.links[0] as FakeLink, 'failed');
    h.advance(CALL_REJOIN_GRACE_MS);
    expect(h.call()?.phase.kind).toBe('reconnecting');
    h.advance(20_000);
    expect(h.call()?.phase).toMatchObject({ kind: 'ended', reason: 'connectionLost' });
    expect(h.names(h.requested)).toContain(CLIENT_EVENTS.CALL_LEAVE);
    expect(ended(h)).toBe(false);
  });
});

describe('la reconnexion du socket repart de liens neufs', () => {
  test('après l’accusé du call:join, les anciens liens sont fermés et une offre neuve est acceptée', async () => {
    const h = await connectedDuo();
    h.binding.authenticated();
    await flush();
    expect((h.links[0] as FakeLink).closed).toBe(true);
    h.engine.handle(SERVER_EVENTS.CALL_SIGNAL, { callId: 'call-1', signal: { type: 'offer', from: PEER, to: ME, sdp: 'v=0', negotiationId: 1 } });
    await flush();
    expect(h.links).toHaveLength(2);
    expect(h.links[1]?.received).toEqual(['offer']);
  });
});

describe('appeler une conversation dont l’appel est en cours le rejoint', () => {
  test('« Appeler » sur un appel actif : call:join, sans force-leave ni initiate', async () => {
    const h = harness({ activeCallId: 'call-live' });
    await h.engine.start(DIRECT);
    expect(h.names(h.emitted)).not.toContain(CLIENT_EVENTS.CALL_FORCE_LEAVE);
    expect(h.names(h.requested)).toEqual([CLIENT_EVENTS.CALL_JOIN]);
    expect(h.call()?.callId).toBe('call-live');
  });

  test('un refus CALL_ALREADY_ACTIVE qui porte l’appel en cours le rejoint', async () => {
    const h = harness({ acks: { [CLIENT_EVENTS.CALL_INITIATE]: { success: false, error: { code: 'CALL_ALREADY_ACTIVE', activeCallId: 'call-raced' } } } });
    await h.engine.start(DIRECT);
    expect(h.names(h.requested)).toEqual([CLIENT_EVENTS.CALL_INITIATE, CLIENT_EVENTS.CALL_JOIN]);
    expect(h.requested[1]?.[1]).toMatchObject({ callId: 'call-raced' });
  });
});

describe('le départ de l’ancienne ligne d’un revenant ne le retire pas', () => {
  test('participant-left de l’ancienne ligne APRÈS participant-joined de la nouvelle : le membre reste', async () => {
    const h = harness();
    await h.engine.start({ ...DIRECT, isGroup: true });
    h.engine.handle(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, joined('p-2', 'u-a'));
    h.engine.handle(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, joined('p-3', 'u-b'));
    h.engine.handle(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, joined('p-2b', 'u-a'));
    h.engine.handle(SERVER_EVENTS.CALL_PARTICIPANT_LEFT, { callId: 'call-1', participantId: 'p-2', userId: 'u-a' });
    expect(h.call()?.members['u-a']).toBeDefined();
    expect((h.links[2] as FakeLink).closed).toBe(false);
  });

  test('le départ de sa ligne courante le retire toujours', async () => {
    const h = harness();
    await h.engine.start({ ...DIRECT, isGroup: true });
    h.engine.handle(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, joined('p-2', 'u-a'));
    h.engine.handle(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, joined('p-3', 'u-b'));
    h.engine.handle(SERVER_EVENTS.CALL_PARTICIPANT_LEFT, { callId: 'call-1', participantId: 'p-2', userId: 'u-a' });
    expect(h.call()?.members['u-a']).toBeUndefined();
  });
});
