/**
 * toCallSessionResponse — aplatissement des participants pour la surface REST.
 *
 * getCallSession() (et initiate/end/join/leave) renvoient la forme Prisma brute :
 * l'identité vit sous `participant.{userId,user}` (nested) et l'état média sous
 * `isAudioEnabled`/`isVideoEnabled`. Or `callSessionSchema` (fast-json-stringify)
 * whiteliste `userId`, `user`, `isMuted`, `isVideoOff` au TOP-LEVEL du
 * participant — tout ce qui n'y est pas est stripé. Résultat sans aplatissement :
 * chaque participant REST se réduit à `{ id, role, joinedAt, leftAt }`, sans
 * identité ni média.
 *
 * Impact prouvé côté client : `ActiveCallParticipant` (CallModels.swift) décode
 * `userId: String` en NON-optionnel — l'absence de `userId` casse le décodage de
 * TOUTE la réponse `GET /calls/active` / `.../active-call`, donc le crash-recovery.
 *
 * Ce helper mappe la forme Prisma vers la forme du schéma REST, et reste
 * idempotent (une entrée déjà aplatie repasse inchangée) et null-safe.
 */

import { describe, it, expect } from '@jest/globals';
import { toCallSessionResponse, toCallParticipantResponse } from '../../../utils/call-session-response.js';

const prismaParticipant = {
  id: 'cp-1',
  participantId: 'part-1',
  role: 'participant',
  joinedAt: new Date('2026-07-12T03:00:00.000Z'),
  leftAt: null,
  isAudioEnabled: false,
  isVideoEnabled: true,
  connectionQuality: 'good',
  participant: {
    userId: 'user-bob',
    displayName: 'Bob (unified)',
    user: {
      id: 'user-bob',
      username: 'bob',
      displayName: 'Bob',
      avatar: 'https://cdn/bob.png',
    },
  },
};

const prismaSession = {
  id: 'call-1',
  conversationId: 'conv-1',
  initiatorId: 'user-alice',
  mode: 'p2p',
  status: 'active',
  metadata: { type: 'video' },
  startedAt: new Date('2026-07-12T03:00:00.000Z'),
  participants: [prismaParticipant],
};

describe('toCallParticipantResponse', () => {
  it('remonte userId depuis participant.userId au top-level', () => {
    const out = toCallParticipantResponse(prismaParticipant);
    expect(out.userId).toBe('user-bob');
  });

  it('remonte l’objet user (identité) au top-level', () => {
    const out = toCallParticipantResponse(prismaParticipant);
    expect(out.user).toMatchObject({ id: 'user-bob', username: 'bob' });
  });

  it('mappe isAudioEnabled=false → isMuted=true (sémantique inversée)', () => {
    const out = toCallParticipantResponse(prismaParticipant);
    expect(out.isMuted).toBe(true);
  });

  it('mappe isVideoEnabled=true → isVideoOff=false', () => {
    const out = toCallParticipantResponse(prismaParticipant);
    expect(out.isVideoOff).toBe(false);
  });

  it('conserve id, role, joinedAt, leftAt', () => {
    const out = toCallParticipantResponse(prismaParticipant);
    expect(out.id).toBe('cp-1');
    expect(out.role).toBe('participant');
    expect(out.leftAt).toBeNull();
  });

  it('retombe sur participantId quand participant.userId est absent', () => {
    const out = toCallParticipantResponse({ id: 'cp-2', participantId: 'part-2', role: 'participant' });
    expect(out.userId).toBe('part-2');
  });

  it('est idempotent sur une entrée déjà aplatie', () => {
    const flat = toCallParticipantResponse(prismaParticipant);
    const again = toCallParticipantResponse(flat as never);
    expect(again.userId).toBe('user-bob');
    expect(again.isMuted).toBe(true);
    expect(again.user).toMatchObject({ id: 'user-bob' });
  });
});

describe('toCallSessionResponse', () => {
  it('aplatit chaque participant de la session', () => {
    const out = toCallSessionResponse(prismaSession);
    expect(out.participants[0].userId).toBe('user-bob');
    expect(out.participants[0].user).toMatchObject({ username: 'bob' });
  });

  it('renseigne participantCount = nombre de participants', () => {
    const out = toCallSessionResponse(prismaSession);
    expect(out.participantCount).toBe(1);
  });

  it('préserve les champs de session (id, mode, status, metadata)', () => {
    const out = toCallSessionResponse(prismaSession);
    expect(out).toMatchObject({ id: 'call-1', mode: 'p2p', status: 'active', metadata: { type: 'video' } });
  });

  it('laisse passer null tel quel (route active-call sans appel en cours)', () => {
    expect(toCallSessionResponse(null)).toBeNull();
  });

  it('gère une session sans tableau participants sans lever', () => {
    const out = toCallSessionResponse({ id: 'call-x' } as never);
    expect(out.id).toBe('call-x');
  });
});
