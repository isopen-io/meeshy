/**
 * Les `call:join` concurrents d'un même utilisateur sur un même appel se
 * SÉRIALISENT (#11468).
 *
 * Production 2026-10-21 : neuf `call:join` de l'appelé depuis cinq sockets en
 * seize secondes, deux à 1 ms d'écart sur la même socket. Chacun lisait « pas
 * encore participant », ouvrait sa transaction, créait sa ligne — et MongoDB
 * rendait « Transaction failed due to a write conflict » sur
 * `callSession.updateMany`, la seconde tentative pouvant échouer à son tour en
 * CALL_STATE_CONFLICT. Sérialisés, le second lit la ligne du premier et rejoint
 * sans écrire.
 *
 * Le double de Prisma ci-dessous tient l'état comme la base : une transaction
 * n'est visible qu'une fois validée, et la garde de version refuse la seconde.
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../services/TURNCredentialService', () => ({
  TURNCredentialService: jest.fn().mockImplementation(() => ({
    generateCredentials: jest.fn().mockReturnValue([{ urls: 'stun:stun.example.com:3478' }]),
  })),
}));

import { CallService } from '../../../services/CallService';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const CALL_ID = 'call-concurrent';
const CONV_ID = 'conv-concurrent';

type Row = { id: string; participantId: string; leftAt: Date | null; joinedAt: Date; participant: { userId: string } };

function fakePrisma() {
  const call = { id: CALL_ID, conversationId: CONV_ID, status: 'ringing', version: 0, metadata: { type: 'audio' }, invitedUserIds: [] as string[], endReason: null, participants: [] as Row[] };
  const transactions = { opened: 0, conflicts: 0 };
  const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 2));
  const snapshot = () => ({ ...call, participants: [...call.participants], conversation: { id: CONV_ID, type: 'direct' } });

  const prisma = {
    callSession: {
      findUnique: async () => {
        await tick();
        return snapshot();
      },
    },
    participant: {
      findFirst: async ({ where }: { where: { id: string } }) => ({ id: where.id, userId: 'user-callee', isActive: true }),
    },
    conversation: { updateMany: async () => ({ count: 1 }) },
    $transaction: async (work: (tx: unknown) => Promise<void>) => {
      transactions.opened += 1;
      const staged: Row[] = [];
      let claimed = false;
      const tx = {
        callParticipant: {
          create: async ({ data }: { data: { participantId: string } }) => {
            staged.push({ id: `cp-${transactions.opened}`, participantId: data.participantId, leftAt: null, joinedAt: new Date(), participant: { userId: 'user-callee' } });
          },
        },
        callSession: {
          updateMany: async ({ where }: { where: { version: number } }) => {
            await tick();
            if (where.version !== call.version) {
              transactions.conflicts += 1;
              return { count: 0 };
            }
            claimed = true;
            return { count: 1 };
          },
        },
      };
      await work(tx);
      if (claimed) {
        call.version += 1;
        call.participants.push(...staged);
      }
    },
  };
  return { prisma: prisma as unknown as PrismaClient, transactions, call };
}

const join = (service: CallService, participantId = 'p-callee') =>
  service.joinCall({ callId: CALL_ID, userId: 'user-callee', participantId });

describe('CallService.joinCall — rafale de joins du même utilisateur (#11468)', () => {
  it('deux joins simultanés n’ouvrent qu’UNE transaction et ne créent qu’une ligne', async () => {
    const { prisma, transactions, call } = fakePrisma();
    const service = new CallService(prisma);

    await Promise.all([join(service), join(service)]);

    expect(transactions.conflicts).toBe(0);
    expect(transactions.opened).toBe(1);
    expect(call.participants).toHaveLength(1);
  });

  it('le premier join dit qu’il a rejoint, le second qu’il était déjà là', async () => {
    const { prisma } = fakePrisma();
    const service = new CallService(prisma);

    const [first, second] = await Promise.all([join(service), join(service)]);

    expect(first.rejoined).toBe(false);
    expect(second.rejoined).toBe(true);
  });
});
