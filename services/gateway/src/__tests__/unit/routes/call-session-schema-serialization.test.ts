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
import { toCallSessionResponse } from '../../../utils/call-session-response.js';

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

/**
 * P1-C : les routes REST passaient la forme Prisma brute (identité sous
 * `participant.{userId,user}`, média sous `isAudioEnabled/isVideoEnabled`).
 * Le whitelist `callSessionSchema` (userId/user/isMuted/isVideoOff au top-level)
 * strippait alors toute l'identité du pair → `ActiveCallParticipant` (iOS)
 * échouait à décoder `userId` (non-optionnel), cassant le crash-recovery.
 * `toCallSessionResponse` aplatit la session avant sérialisation.
 */
describe('callSessionSchema — identité participant (P1-C)', () => {
  const rawPrismaSession = {
    ...SAMPLE_SESSION,
    participants: [
      {
        id: 'cp-1',
        participantId: 'part-1',
        role: 'participant',
        joinedAt: '2026-07-12T03:00:00.000Z',
        leftAt: null,
        isAudioEnabled: false,
        isVideoEnabled: true,
        participant: {
          userId: 'user-bob',
          user: { id: 'user-bob', username: 'bob', displayName: 'Bob', avatar: null },
        },
      },
    ],
  };

  it('RÉGRESSION : la forme Prisma brute perd userId + user au whitelist', () => {
    const out = serialize(rawPrismaSession);

    expect(out.participants[0].userId).toBeUndefined();
    expect(out.participants[0].user).toBeUndefined();
  });

  it('toCallSessionResponse préserve userId à travers le whitelist', () => {
    const out = serialize(toCallSessionResponse(rawPrismaSession));

    expect(out.participants[0].userId).toBe('user-bob');
  });

  it('toCallSessionResponse préserve l’objet user (identité du pair)', () => {
    const out = serialize(toCallSessionResponse(rawPrismaSession));

    expect(out.participants[0].user).toMatchObject({ id: 'user-bob', username: 'bob' });
  });

  it('toCallSessionResponse mappe l’état média (isAudioEnabled → isMuted)', () => {
    const out = serialize(toCallSessionResponse(rawPrismaSession));

    expect(out.participants[0].isMuted).toBe(true);
    expect(out.participants[0].isVideoOff).toBe(false);
  });
});
