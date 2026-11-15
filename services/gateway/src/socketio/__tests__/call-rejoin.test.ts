import { describe, it, expect, jest } from '@jest/globals';
import { CALL_HEARTBEAT_TIMEOUT_MS, CALL_REJOIN_GRACE_MS } from '@meeshy/shared/types/call-rules';
import { CALL_ERROR_CODES } from '@meeshy/shared/types/video-call';

import {
  DISCONNECT_GRACE_MS,
  GRACE_EXTENSION_MS,
  MAX_GRACE_EXTENSIONS,
  alreadyActiveCallDetails,
  isCallRevenant,
} from '../call-rejoin';
import { forceLeaveSparesLiveCall } from '../call-force-leave-scope';

const ANSWERED = new Date('2026-10-02T10:00:00Z');
const JOIN = new Date('2026-10-02T10:05:00Z');

function row(userId: string, opts: { leftAt?: Date | null; joinedAt?: Date } = {}) {
  return { participantId: `p-${userId}`, participant: { userId }, leftAt: opts.leftAt ?? null, joinedAt: opts.joinedAt ?? JOIN };
}

describe('la grâce de reprise (#9111)', () => {
  it('vaut la règle partagée — 60 s', () => {
    expect(DISCONNECT_GRACE_MS).toBe(CALL_REJOIN_GRACE_MS);
    expect(DISCONNECT_GRACE_MS).toBe(60_000);
  });

  it('ses prolongations ne dépassent jamais le nettoyage par battements', () => {
    expect(DISCONNECT_GRACE_MS + MAX_GRACE_EXTENSIONS * GRACE_EXTENSION_MS).toBeLessThanOrEqual(CALL_HEARTBEAT_TIMEOUT_MS);
    expect(MAX_GRACE_EXTENSIONS).toBeGreaterThan(0);
  });
});

describe('isCallRevenant — celui qui revient dans un appel décroché', () => {
  it('un participant qui avait quitté sa ligne est un revenant', () => {
    expect(isCallRevenant({ answeredAt: ANSWERED, userId: 'b', joinStartedAt: JOIN, rows: [row('a'), row('b', { leftAt: ANSWERED }), row('b')] })).toBe(true);
  });

  it('une ligne vivante d’avant ce join (retour dans la grâce) est un revenant', () => {
    expect(isCallRevenant({ answeredAt: ANSWERED, userId: 'b', joinStartedAt: JOIN, rows: [row('a'), row('b', { joinedAt: ANSWERED })] })).toBe(true);
  });

  it('un premier arrivant n’en est pas un', () => {
    expect(isCallRevenant({ answeredAt: ANSWERED, userId: 'c', joinStartedAt: JOIN, rows: [row('a'), row('c', { joinedAt: new Date(JOIN.getTime() + 5) })] })).toBe(false);
  });

  it('un appel jamais décroché garde le rejeu de l’offre (réveil PushKit pendant la sonnerie)', () => {
    expect(isCallRevenant({ answeredAt: null, userId: 'b', joinStartedAt: JOIN, rows: [row('a'), row('b', { joinedAt: ANSWERED })] })).toBe(false);
  });
});

describe('forceLeaveSparesLiveCall — call:force-leave n’arrête pas un appel vivant', () => {
  it('épargne un appel décroché où un autre participant est actif', () => {
    expect(forceLeaveSparesLiveCall({ answeredAt: ANSWERED, participants: [row('a'), row('b')] }, 'b')).toBe(true);
  });

  it('nettoie un appel décroché où l’on est seul', () => {
    expect(forceLeaveSparesLiveCall({ answeredAt: ANSWERED, participants: [row('a', { leftAt: JOIN }), row('b')] }, 'b')).toBe(false);
  });

  it('nettoie un appel jamais décroché', () => {
    expect(forceLeaveSparesLiveCall({ answeredAt: null, participants: [row('a'), row('b')] }, 'b')).toBe(false);
  });
});

describe('alreadyActiveCallDetails — le refus dit quel appel rejoindre', () => {
  const prismaWith = (found: { id: string } | null) => ({
    callSession: { findFirst: jest.fn<() => Promise<{ id: string } | null>>().mockResolvedValue(found) },
  });

  it('porte l’identifiant de l’appel en cours sur CALL_ALREADY_ACTIVE', async () => {
    const prisma = prismaWith({ id: 'call-live' });
    await expect(alreadyActiveCallDetails(prisma as never, CALL_ERROR_CODES.CALL_ALREADY_ACTIVE, 'conv-1')).resolves.toEqual({ activeCallId: 'call-live' });
  });

  it('ne lit rien pour un autre refus', async () => {
    const prisma = prismaWith({ id: 'call-live' });
    await expect(alreadyActiveCallDetails(prisma as never, CALL_ERROR_CODES.NOT_A_PARTICIPANT, 'conv-1')).resolves.toEqual({});
    expect(prisma.callSession.findFirst).not.toHaveBeenCalled();
  });

  it('se tait quand la lecture échoue', async () => {
    const prisma = { callSession: { findFirst: jest.fn<() => Promise<never>>().mockRejectedValue(new Error('db')) } };
    await expect(alreadyActiveCallDetails(prisma as never, CALL_ERROR_CODES.CALL_ALREADY_ACTIVE, 'conv-1')).resolves.toEqual({});
  });
});
