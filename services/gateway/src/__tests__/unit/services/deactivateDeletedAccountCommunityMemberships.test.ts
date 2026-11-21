/**
 * Unit tests for deactivateCommunityMembershipsOfDeletedAccount (#5801, #18769).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { deactivateCommunityMembershipsOfDeletedAccount } from '../../../services/deactivateDeletedAccountCommunityMemberships';
import type { CommunityMemberChange } from '../../../services/community-member-broadcast';

const USER_ID = '507f1f77bcf86cd799439011';
const COMMUNITY_A = '507f1f77bcf86cd799439aaa';
const COMMUNITY_B = '507f1f77bcf86cd799439bbb';

function fakePrisma(options: { readonly active?: ReadonlyArray<string>; readonly count?: number; readonly updateFails?: boolean } = {}) {
  const active = options.active ?? [];
  return {
    communityMember: {
      findMany: jest.fn<any>().mockResolvedValue(active.map((communityId) => ({ communityId }))),
      updateMany: options.updateFails
        ? jest.fn<any>().mockRejectedValue(new Error('mongo down'))
        : jest.fn<any>().mockResolvedValue({ count: options.count ?? active.length }),
    },
  } as any;
}

function recordingAnnounce() {
  const batches: CommunityMemberChange[][] = [];
  return { batches, announce: (changes: readonly CommunityMemberChange[]) => { batches.push([...changes]); } };
}

describe('deactivateCommunityMembershipsOfDeletedAccount', () => {
  it('deactivates every ACTIVE CommunityMember row of the account, leaving already-inactive rows alone', async () => {
    const prisma = fakePrisma({ active: [COMMUNITY_A, COMMUNITY_B, '507f1f77bcf86cd799439ccc'] });

    const summary = await deactivateCommunityMembershipsOfDeletedAccount(prisma, USER_ID, recordingAnnounce().announce);

    expect(prisma.communityMember.updateMany).toHaveBeenCalledWith({
      where: { userId: USER_ID, isActive: true },
      data: { isActive: false, leftAt: expect.any(Date) },
    });
    expect(summary.deactivated).toBe(3);
  });

  it('does not delete the rows — it flips isActive and stamps leftAt, never deleteMany', async () => {
    const prisma = fakePrisma();

    await deactivateCommunityMembershipsOfDeletedAccount(prisma, USER_ID, recordingAnnounce().announce);

    expect(prisma.communityMember.deleteMany).toBeUndefined();
  });

  it('is idempotent — an account with no active membership left touches nothing and announces nothing', async () => {
    const prisma = fakePrisma();
    const { batches, announce } = recordingAnnounce();

    const summary = await deactivateCommunityMembershipsOfDeletedAccount(prisma, USER_ID, announce);

    expect(summary).toEqual({ deactivated: 0 });
    expect(batches.flat()).toEqual([]);
  });

  it("annonce un départ « retiré » dans CHAQUE communauté qu'il quittait, et rien d'autre (#18769)", async () => {
    const prisma = fakePrisma({ active: [COMMUNITY_A, COMMUNITY_B] });
    const { batches, announce } = recordingAnnounce();

    await deactivateCommunityMembershipsOfDeletedAccount(prisma, USER_ID, announce);

    expect(batches.flat()).toEqual([
      { kind: 'left', communityId: COMMUNITY_A, userId: USER_ID, reason: 'removed' },
      { kind: 'left', communityId: COMMUNITY_B, userId: USER_ID, reason: 'removed' },
    ]);
  });

  it("lit les appartenances AVANT l'écriture : après, il n'y en aurait plus aucune d'active", async () => {
    const prisma = fakePrisma({ active: [COMMUNITY_A] });

    await deactivateCommunityMembershipsOfDeletedAccount(prisma, USER_ID, recordingAnnounce().announce);

    expect(prisma.communityMember.findMany).toHaveBeenCalledWith({
      where: { userId: USER_ID, isActive: true },
      select: { communityId: true },
    });
    const readOrder = prisma.communityMember.findMany.mock.invocationCallOrder[0];
    const writeOrder = prisma.communityMember.updateMany.mock.invocationCallOrder[0];
    expect(readOrder).toBeLessThan(writeOrder);
  });

  it("n'annonce rien quand l'écriture échoue : un départ qui n'a pas eu lieu ne s'annonce pas", async () => {
    const prisma = fakePrisma({ active: [COMMUNITY_A], updateFails: true });
    const { batches, announce } = recordingAnnounce();

    await expect(deactivateCommunityMembershipsOfDeletedAccount(prisma, USER_ID, announce)).rejects.toThrow('mongo down');

    expect(batches.flat()).toEqual([]);
  });

  it("n'annonce rien quand une course a déjà tout désactivé entre la lecture et l'écriture", async () => {
    const prisma = fakePrisma({ active: [COMMUNITY_A], count: 0 });
    const { batches, announce } = recordingAnnounce();

    await deactivateCommunityMembershipsOfDeletedAccount(prisma, USER_ID, announce);

    expect(batches.flat()).toEqual([]);
  });
});
