/**
 * Unit tests for deactivateCommunityMembershipsOfDeletedAccount (#5801).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { deactivateCommunityMembershipsOfDeletedAccount } from '../../../services/deactivateDeletedAccountCommunityMemberships';

const USER_ID = '507f1f77bcf86cd799439011';

function fakePrisma(overrides: Record<string, any> = {}) {
  return {
    communityMember: { updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
    ...overrides,
  } as any;
}

describe('deactivateCommunityMembershipsOfDeletedAccount', () => {
  it('deactivates every ACTIVE CommunityMember row of the account, leaving already-inactive rows alone', async () => {
    const prisma = fakePrisma({ communityMember: { updateMany: jest.fn<any>().mockResolvedValue({ count: 3 }) } });

    const summary = await deactivateCommunityMembershipsOfDeletedAccount(prisma, USER_ID);

    expect(prisma.communityMember.updateMany).toHaveBeenCalledWith({
      where: { userId: USER_ID, isActive: true },
      data: { isActive: false, leftAt: expect.any(Date) },
    });
    expect(summary.deactivated).toBe(3);
  });

  it('does not delete the rows — it flips isActive and stamps leftAt, never deleteMany', async () => {
    const prisma = fakePrisma();

    await deactivateCommunityMembershipsOfDeletedAccount(prisma, USER_ID);

    expect(prisma.communityMember.deleteMany).toBeUndefined();
  });

  it('is idempotent — an account with no active membership left touches nothing', async () => {
    const prisma = fakePrisma();

    const summary = await deactivateCommunityMembershipsOfDeletedAccount(prisma, USER_ID);

    expect(summary).toEqual({ deactivated: 0 });
  });
});
