/**
 * #13350 — `friendRequestsReceived` ne compte pas les demandes d'une personne
 * en relation de blocage avec l'utilisateur, dans un sens ou dans l'autre :
 * les listes servies les retirent déjà (#13298), le compteur ne peut pas en
 * annoncer davantage.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { computeUserAchievementStats } from '../../../routes/user-stats';

const MOI = '507f1f77bcf86cd799439099';
const AMI = '507f1f77bcf86cd799439012';
const BLOQUE = '507f1f77bcf86cd799439013';

type CountWhere = { receiverId: string; senderId?: { notIn: string[] } };

function fakePrisma(blocks: Record<string, string[]>) {
  const blockedOf = (id: string): string[] => blocks[id] ?? [];
  const requests = [{ senderId: AMI, receiverId: MOI }, { senderId: BLOQUE, receiverId: MOI }];
  return {
    participant: { findMany: jest.fn(async () => []), count: jest.fn(async () => 0) },
    message: { count: jest.fn(async () => 0), groupBy: jest.fn(async () => []) },
    friendRequest: {
      count: jest.fn(async ({ where }: { where: CountWhere }) =>
        requests.filter((r) => r.receiverId === where.receiverId && !(where.senderId?.notIn ?? []).includes(r.senderId)).length,
      ),
    },
    user: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => ({ createdAt: new Date(), blockedUserIds: blockedOf(where.id) })),
      findMany: jest.fn(async ({ where }: { where: { blockedUserIds: { has: string } } }) =>
        Object.keys(blocks).filter((id) => blockedOf(id).includes(where.blockedUserIds.has)).map((id) => ({ id })),
      ),
    },
  } as unknown as PrismaClient;
}

describe('#13350 — le compteur de demandes reçues ignore les personnes bloquées', () => {
  it.each([
    ["j'ai bloqué l'expéditeur", { [MOI]: [BLOQUE], [BLOQUE]: [], [AMI]: [] }],
    ["l'expéditeur m'a bloqué", { [MOI]: [], [BLOQUE]: [MOI], [AMI]: [] }],
  ])('%s', async (_sens, blocks) => {
    const stats = await computeUserAchievementStats(fakePrisma(blocks), MOI);
    expect(stats.friendRequestsReceived).toBe(1);
  });

  it('sans blocage, toutes les demandes comptent', async () => {
    const stats = await computeUserAchievementStats(fakePrisma({ [MOI]: [], [BLOQUE]: [], [AMI]: [] }), MOI);
    expect(stats.friendRequestsReceived).toBe(2);
  });
});
