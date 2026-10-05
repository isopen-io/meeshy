/**
 * #8293 — un appel raccroché se termine en base au lieu de rester « en cours ».
 *
 * Au raccroché, les deux clients émettent `call:analytics` dans la même
 * milliseconde que `call:end` ; l'écriture de télémétrie sur `CallParticipant`
 * fait échouer la transaction de fin en P2034. `endCall` rangeait ce P2034 en
 * « course perdue » sans relire : la session restait `active`, `leftAt` vide,
 * et la bulle affichait « en cours · Rejoindre » jusqu'au ramasse-miettes.
 *
 * Le double Prisma ci-dessous tient un ÉTAT : une transaction qui échoue ne
 * change rien, une transaction qui passe écrit ce que la production écrit. Le
 * témoin assert sur cet état, pas sur les appels.
 */

import { describe, it, expect, jest } from '@jest/globals';

import { CallService, CallAlreadyEndedError } from '../../../services/CallService';
import { CallEndReason, CallStatus, ParticipantRole } from '@meeshy/shared/prisma/client';

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

jest.mock('../../../services/TURNCredentialService', () => ({
  TURNCredentialService: jest.fn().mockImplementation(() => ({
    generateCredentials: jest.fn().mockReturnValue([]),
    isConfigured: jest.fn().mockReturnValue(true),
    getStatus: jest.fn().mockReturnValue({})
  }))
}));

type Row = { id: string; participantId: string; role: ParticipantRole; leftAt: Date | null };
type Session = {
  id: string;
  conversationId: string;
  status: CallStatus;
  version: number;
  answeredAt: Date | null;
  endedAt: Date | null;
  endReason: CallEndReason | null;
  metadata: Record<string, unknown>;
  participants: Row[];
};

const p2034 = () =>
  Object.assign(new Error('Transaction failed due to a write conflict or a deadlock. Please retry your transaction'), {
    code: 'P2034'
  });

const answeredCall = (): Session => ({
  id: 'call-8293',
  conversationId: 'conv-8293',
  status: CallStatus.active,
  version: 3,
  answeredAt: new Date(Date.now() - 60_000),
  endedAt: null,
  endReason: null,
  metadata: { type: 'audio' },
  participants: [
    { id: 'row-a', participantId: 'part-a', role: ParticipantRole.initiator, leftAt: null },
    { id: 'row-b', participantId: 'part-b', role: ParticipantRole.participant, leftAt: null }
  ]
});

type FakeOptions = {
  readonly failures: number;
  readonly onFailure?: (state: { session: Session }) => void;
};

const fakePrisma = (initial: Session, options: FakeOptions) => {
  const state = { session: initial };
  const remaining = { failures: options.failures };
  const snapshot = () => ({
    ...state.session,
    participants: state.session.participants.map((row) => ({ ...row }))
  });

  const tx = {
    callParticipant: {
      updateMany: async ({ data }: { data: { leftAt: Date } }) => {
        const open = state.session.participants.filter((row) => row.leftAt === null);
        state.session = {
          ...state.session,
          participants: state.session.participants.map((row) =>
            row.leftAt === null ? { ...row, leftAt: data.leftAt } : row
          )
        };
        return { count: open.length };
      }
    },
    callSession: {
      updateMany: async ({ where, data }: { where: { version: number }; data: Record<string, unknown> }) => {
        if (where.version !== state.session.version) return { count: 0 };
        state.session = {
          ...state.session,
          status: data.status as CallStatus,
          endedAt: data.endedAt as Date,
          endReason: data.endReason as CallEndReason,
          version: state.session.version + 1
        };
        return { count: 1 };
      }
    }
  };

  const transaction = jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => {
    if (remaining.failures > 0) {
      remaining.failures -= 1;
      options.onFailure?.(state);
      throw p2034();
    }
    const before = state.session;
    try {
      return await callback(tx);
    } catch (error) {
      state.session = before;
      throw error;
    }
  });

  const prisma = {
    callSession: { findUnique: jest.fn(async () => snapshot()) },
    conversation: {
      findUnique: jest.fn(async () => ({ type: 'direct' })),
      updateMany: jest.fn(async () => ({ count: 1 }))
    },
    $transaction: transaction
  };

  return { prisma, state, transaction };
};

const serviceOver = (prisma: unknown) => new CallService(prisma as ConstructorParameters<typeof CallService>[0]);

describe('endCall face à un P2034 du raccroché (#8293)', () => {
  it('retente la fin quand l’appel est encore actif à la relecture, et le termine en base', async () => {
    const { prisma, state, transaction } = fakePrisma(answeredCall(), { failures: 1 });

    const ended = await serviceOver(prisma).endCall('call-8293', 'user-a', 'part-a');

    expect(transaction).toHaveBeenCalledTimes(2);
    expect(state.session.status).toBe(CallStatus.ended);
    expect(state.session.endReason).toBe(CallEndReason.completed);
    expect(state.session.endedAt).toBeInstanceOf(Date);
    expect(state.session.participants.every((row) => row.leftAt instanceof Date)).toBe(true);
    expect(ended.status).toBe(CallStatus.ended);
  });

  it('n’écrit rien une seconde fois quand un autre rédacteur a terminé l’appel entre-temps', async () => {
    const endedByOther = new Date();
    const { prisma, state, transaction } = fakePrisma(answeredCall(), {
      failures: 1,
      onFailure: (current) => {
        current.session = {
          ...current.session,
          status: CallStatus.ended,
          endReason: CallEndReason.connectionLost,
          endedAt: endedByOther,
          version: current.session.version + 1
        };
      }
    });

    const rejection = serviceOver(prisma).endCall('call-8293', 'user-a', 'part-a');

    await expect(rejection).rejects.toBeInstanceOf(CallAlreadyEndedError);
    await expect(rejection).rejects.toMatchObject({ endReason: CallEndReason.connectionLost });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(state.session.endedAt).toBe(endedByOther);
    expect(state.session.participants.every((row) => row.leftAt === null)).toBe(true);
  });

  it('abandonne après trois tentatives sans laisser croire que l’appel est terminé', async () => {
    const { prisma, state, transaction } = fakePrisma(answeredCall(), { failures: 5 });

    await expect(serviceOver(prisma).endCall('call-8293', 'user-a', 'part-a')).rejects.toMatchObject({
      code: 'P2034'
    });
    expect(transaction).toHaveBeenCalledTimes(3);
    expect(state.session.status).toBe(CallStatus.active);
  });
});
