import { afterEach, describe, expect, test } from 'bun:test';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { DIRECT, harness, PEER, type FakeLink } from '@/test-support/call-engine-harness';

import { resetCallTransportForTests } from './call-transport';

/**
 * UNE ANNONCE EN DOUBLE NE DÉTRUIT PAS LA NÉGOCIATION EN COURS (#11468) — un
 * appelé connecté sur plusieurs appareils faisait réannoncer
 * `call:participant-joined` à chaque arrivée d'appareil ; le moteur fermait son
 * lien et envoyait une seconde offre, 31 s de mise en relation en production.
 * La passerelle ne réannonce plus ; le moteur, en défense, garde un lien qui
 * négocie encore quand l'annonce porte la MÊME ligne de participant.
 */

afterEach(() => resetCallTransportForTests());

const joined = (id: string) => ({ callId: 'call-1', participant: { id, userId: PEER, username: PEER, displayName: PEER } });

describe('participant-joined en double pour le même pair', () => {
  test('même ligne, lien encore en négociation : le lien reste, aucune seconde offre', async () => {
    const h = harness();
    await h.engine.start(DIRECT);
    h.engine.handle(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, joined('p-2'));
    h.engine.handle(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, joined('p-2'));

    expect(h.links).toHaveLength(1);
    expect((h.links[0] as FakeLink).closed).toBe(false);
    expect(h.links[0]?.offers).toBe(1);
  });

  test('une ligne NEUVE (pair revenu) remplace le lien et repart d’une offre fraîche', async () => {
    const h = harness();
    await h.engine.start(DIRECT);
    h.engine.handle(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, joined('p-2'));
    h.engine.handle(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, joined('p-2b'));

    expect((h.links[0] as FakeLink).closed).toBe(true);
    expect(h.links).toHaveLength(2);
    expect(h.links[1]?.offers).toBe(1);
  });

  test('même ligne mais lien établi : une annonce (reconnexion du pair) repart d’une offre fraîche', async () => {
    const h = harness();
    await h.engine.start(DIRECT);
    h.engine.handle(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, joined('p-2'));
    h.linkState(h.links[0] as FakeLink, 'connected');
    h.engine.handle(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, joined('p-2'));

    expect(h.links).toHaveLength(2);
    expect(h.links[1]?.offers).toBe(1);
  });
});
