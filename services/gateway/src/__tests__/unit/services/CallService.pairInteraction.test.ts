/**
 * #13932 — décrocher un appel le compte pour la paire (câblage de `CallService.updateCallStatus`).
 * Un fichier à part : la suite principale de `CallService` est hors budget et ne grossit plus.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { CallStatus } from '@meeshy/shared/prisma/client';
import { CallService } from '../../../services/CallService';
import { pairInteractionStore } from '../../helpers/pair-interaction-store';

const ME = '5f0000000000000000000001';
const PEER = '5f0000000000000000000002';
const settle = async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

const session = (over: Record<string, unknown>) => ({
  id: 'call-123', conversationId: 'cv1', status: CallStatus.ringing, answeredAt: null, version: 1, initiatorId: ME,
  participants: [], initiator: { id: ME }, conversation: { id: 'cv1' }, ...over,
});

const build = (current: ReturnType<typeof session>) => {
  const store = pairInteractionStore();
  const prisma = {
    ...store.prisma,
    callSession: {
      findUnique: jest.fn(async () => current),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    callParticipant: { findMany: jest.fn(async () => [{ participant: { userId: ME } }, { participant: { userId: PEER } }]) },
  };
  return { store, service: new CallService(prisma as never) };
};

describe('CallService.updateCallStatus — les cercles', () => {
  it('décrocher un appel à deux le compte dans les deux sens', async () => {
    const { store, service } = build(session({}));

    await service.updateCallStatus('call-123', CallStatus.active);
    await settle();

    expect(store.days()).toHaveLength(1);
    expect(store.days()[0]).toMatchObject({ userLowId: ME, userHighId: PEER, byLowCall: 1, byHighCall: 1 });
  });

  it('une reconnexion d’un appel déjà décroché ne le recompte pas', async () => {
    const { store, service } = build(session({ status: CallStatus.active, answeredAt: new Date() }));

    await service.updateCallStatus('call-123', CallStatus.reconnecting);
    await settle();

    expect(store.days()).toHaveLength(0);
  });
});
