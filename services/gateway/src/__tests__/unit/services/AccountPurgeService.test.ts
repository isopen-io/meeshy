/**
 * Unit tests for AccountPurgeService (#3632).
 *
 * Covers the three ISOLATED tables purged when an account-deletion grace
 * period expires: sessions, voice profile, share links created by the
 * account. Messages/media/identity anonymization are explicitly out of
 * scope for this module — see its doc-comment.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { purgeAccountIsolatedData } from '../../../services/AccountPurgeService';

const USER_ID = '507f1f77bcf86cd799439011';

function fakePrisma(overrides: Record<string, any> = {}) {
  return {
    userSession: { deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
    userVoiceModel: { deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
    conversationShareLink: { deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
    ...overrides,
  } as any;
}

describe('purgeAccountIsolatedData', () => {
  it('deletes every UserSession row for the account', async () => {
    const prisma = fakePrisma({ userSession: { deleteMany: jest.fn<any>().mockResolvedValue({ count: 3 }) } });
    const summary = await purgeAccountIsolatedData(prisma, USER_ID);
    expect(prisma.userSession.deleteMany).toHaveBeenCalledWith({ where: { userId: USER_ID } });
    expect(summary.sessionsDeleted).toBe(3);
  });

  it('deletes the UserVoiceModel row for the account', async () => {
    const prisma = fakePrisma({ userVoiceModel: { deleteMany: jest.fn<any>().mockResolvedValue({ count: 1 }) } });
    const summary = await purgeAccountIsolatedData(prisma, USER_ID);
    expect(prisma.userVoiceModel.deleteMany).toHaveBeenCalledWith({ where: { userId: USER_ID } });
    expect(summary.voiceProfileDeleted).toBe(1);
  });

  it('deletes share links CREATED by the account, not links it merely used to join', async () => {
    const prisma = fakePrisma({ conversationShareLink: { deleteMany: jest.fn<any>().mockResolvedValue({ count: 2 }) } });
    const summary = await purgeAccountIsolatedData(prisma, USER_ID);
    expect(prisma.conversationShareLink.deleteMany).toHaveBeenCalledWith({ where: { createdBy: USER_ID } });
    expect(summary.shareLinksDeleted).toBe(2);
  });

  it('runs all three deletions even when every table is already empty (idempotent)', async () => {
    const prisma = fakePrisma();
    const summary = await purgeAccountIsolatedData(prisma, USER_ID);
    expect(summary).toEqual({ sessionsDeleted: 0, voiceProfileDeleted: 0, shareLinksDeleted: 0 });
  });
});
