/**
 * Unit tests for AccountPurgeService (#3632, #5691).
 *
 * Covers the three ISOLATED tables purged when an account-deletion grace
 * period expires (sessions, voice profile, share links created by the
 * account) and the identity anonymization of the `User` row (#5691).
 * Messages/media anonymization are explicitly out of scope for this module —
 * see its doc-comment (#5689, #5690).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { purgeAccountIsolatedData, anonymizeUserIdentity } from '../../../services/AccountPurgeService';

jest.mock('../../../utils/password-hash', () => ({
  hashPassword: jest.fn(async () => '$2b$12$hash-de-test'),
}));

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

function fakeUserPrisma(overrides: Record<string, any> = {}) {
  return {
    user: { updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }) },
    ...overrides,
  } as any;
}

describe('anonymizeUserIdentity', () => {
  it('derives username/email from the account id, never a shared constant', async () => {
    const prisma = fakeUserPrisma();
    await anonymizeUserIdentity(prisma, USER_ID);

    const [call] = (prisma.user.updateMany as jest.Mock<any>).mock.calls;
    const [{ where, data }] = call as [{ where: any; data: any }];

    expect(where).toEqual({ id: USER_ID, username: { not: `compte-supprime-${USER_ID}` } });
    expect(data.username).toBe(`compte-supprime-${USER_ID}`);
    expect(data.email).toBe(`compte-supprime-${USER_ID}@deleted.meeshy.invalid`);
  });

  it('clears the identity/contact/avatar fields', async () => {
    const prisma = fakeUserPrisma();
    await anonymizeUserIdentity(prisma, USER_ID);

    const [{ data }] = (prisma.user.updateMany as jest.Mock<any>).mock.calls[0] as [{ data: any }];
    expect(data).toMatchObject({
      firstName: 'Compte',
      lastName: 'supprimé',
      displayName: null,
      avatar: null,
      banner: null,
      bio: '',
      birthDate: null,
      phoneNumber: null,
      phoneCountryCode: null,
      referralCode: null,
      usernameHistory: [],
      searchTokens: [],
      blockedUserIds: [],
    });
  });

  it('clears authentication secrets — 2FA, Signal Protocol keys, and rehashes the password', async () => {
    const prisma = fakeUserPrisma();
    await anonymizeUserIdentity(prisma, USER_ID);

    const [{ data }] = (prisma.user.updateMany as jest.Mock<any>).mock.calls[0] as [{ data: any }];
    expect(data).toMatchObject({
      password: '$2b$12$hash-de-test',
      twoFactorSecret: null,
      twoFactorBackupCodes: [],
      twoFactorPendingSecret: null,
      twoFactorChallengeHash: null,
      twoFactorChallengeExpiresAt: null,
      signalIdentityKeyPublic: null,
      signalIdentityKeyPrivate: null,
      signalRegistrationId: null,
      signalPreKeyBundleVersion: null,
    });
  });

  it('never touches engagement/streak aggregates — a decided exclusion, not an oversight', async () => {
    const prisma = fakeUserPrisma();
    await anonymizeUserIdentity(prisma, USER_ID);

    const [{ data }] = (prisma.user.updateMany as jest.Mock<any>).mock.calls[0] as [{ data: any }];
    expect(data).not.toHaveProperty('engagementScore');
    expect(data).not.toHaveProperty('currentStreakDays');
    expect(data).not.toHaveProperty('longestStreakDays');
    expect(data).not.toHaveProperty('lastStreakDate');
  });

  it('reports anonymized:true when the row was actually rewritten', async () => {
    const prisma = fakeUserPrisma({ user: { updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }) } });
    const summary = await anonymizeUserIdentity(prisma, USER_ID);
    expect(summary).toEqual({ userId: USER_ID, anonymized: true });
  });

  it('is idempotent — a second run matches nothing (already-anonymized username excluded) and reports anonymized:false', async () => {
    const prisma = fakeUserPrisma({ user: { updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }) } });
    const summary = await anonymizeUserIdentity(prisma, USER_ID);
    expect(summary).toEqual({ userId: USER_ID, anonymized: false });
  });
});
