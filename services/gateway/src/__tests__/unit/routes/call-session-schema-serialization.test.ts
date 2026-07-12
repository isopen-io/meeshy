/**
 * callSessionSchema — contrat de SÉRIALISATION (fast-json-stringify).
 *
 * Les tests de routes mockent sendSuccess : le schema de réponse n'y est
 * jamais exercé. Or fast-json-stringify strippe tout champ absent de la
 * whitelist — c'est la protection privacy voulue (fix 2026-05-12 : metadata
 * brut Prisma fuitait la télémétrie d'autres participants), mais elle a aussi
 * strippé le TYPE d'appel (metadata.type audio|video), la seule source du
 * payload REST active-call : iOS `ActiveCallSession.isVideo` lisait
 * `mode == "video"` alors que `mode` transporte l'architecture WebRTC
 * (p2p|sfu) — une visio rejointe après crash reprenait en AUDIO.
 *
 * Ce test épingle le contrat au niveau où le bug vivait : la sortie
 * sérialisée elle-même.
 */

import { describe, it, expect } from '@jest/globals';
import fastJsonStringify from 'fast-json-stringify';
import { callSessionSchema } from '@meeshy/shared/types/api-schemas';

const SAMPLE_SESSION = {
  id: '507f1f77bcf86cd799439031',
  conversationId: '507f1f77bcf86cd799439032',
  initiatorId: 'user-alice',
  mode: 'p2p',
  status: 'active',
  metadata: {
    type: 'video',
    initiatorDeviceId: 'private-device-fingerprint',
    turnSecretHint: 'never-leak-me',
  },
  startedAt: '2026-07-12T03:00:00.000Z',
  participants: [],
  participantCount: 2,
};

function serialize(payload: unknown): Record<string, any> {
  const stringify = fastJsonStringify(callSessionSchema as never);
  return JSON.parse(stringify(payload));
}

describe('callSessionSchema — sérialisation REST', () => {
  it('laisse passer metadata.type — la seule source du type audio/video du payload', () => {
    const out = serialize(SAMPLE_SESSION);

    expect(out.metadata?.type).toBe('video');
  });

  it('strippe les autres clés de metadata (whitelist privacy, fix 2026-05-12)', () => {
    const out = serialize(SAMPLE_SESSION);

    expect(out.metadata?.initiatorDeviceId).toBeUndefined();
    expect(out.metadata?.turnSecretHint).toBeUndefined();
  });

  it('laisse passer mode tel quel — architecture WebRTC (p2p|sfu), PAS le type d’appel', () => {
    const out = serialize(SAMPLE_SESSION);

    expect(out.mode).toBe('p2p');
  });

  it('un appel sans metadata sérialise sans crasher (sessions legacy)', () => {
    const { metadata: _metadata, ...withoutMetadata } = SAMPLE_SESSION;

    const out = serialize(withoutMetadata);

    expect(out.id).toBe(SAMPLE_SESSION.id);
    expect(out.metadata ?? null).toBeNull();
  });
});
