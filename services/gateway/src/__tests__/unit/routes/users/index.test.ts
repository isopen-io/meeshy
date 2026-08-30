/**
 * Unit tests for users index route (index.ts)
 * Verifies that userRoutes() registers all route handlers with fastify.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockProfileFns = {
  updateUserProfile: jest.fn<any>().mockResolvedValue(undefined),
  updateUserAvatar: jest.fn<any>().mockResolvedValue(undefined),
  updateUserBanner: jest.fn<any>().mockResolvedValue(undefined),
  updateUserPassword: jest.fn<any>().mockResolvedValue(undefined),
  updateUsername: jest.fn<any>().mockResolvedValue(undefined),
  getUserByUsername: jest.fn<any>().mockResolvedValue(undefined),
  getUserById: jest.fn<any>().mockResolvedValue(undefined),
  getUserByEmail: jest.fn<any>().mockResolvedValue(undefined),
  getUserByIdDedicated: jest.fn<any>().mockResolvedValue(undefined),
  getUserByPhone: jest.fn<any>().mockResolvedValue(undefined),
};

jest.mock('../../../../routes/users/profile', () => mockProfileFns);

const mockContactFns = {
  initiateEmailChange: jest.fn<any>().mockResolvedValue(undefined),
  verifyEmailChange: jest.fn<any>().mockResolvedValue(undefined),
  resendEmailChangeVerification: jest.fn<any>().mockResolvedValue(undefined),
  initiatePhoneChange: jest.fn<any>().mockResolvedValue(undefined),
  verifyPhoneChange: jest.fn<any>().mockResolvedValue(undefined),
};

jest.mock('../../../../routes/users/contact-change', () => mockContactFns);

// Surface unifiée `/me/contact-changes` (#4341) — module SÉPARÉ de
// `contact-change.ts` (budget de taille, voir son doc-comment de tête).
const mockContactChangesFns = {
  initiateContactChange: jest.fn<any>().mockResolvedValue(undefined),
  verifyContactChange: jest.fn<any>().mockResolvedValue(undefined),
  resendContactChangeVerification: jest.fn<any>().mockResolvedValue(undefined),
  getContactChangeStatus: jest.fn<any>().mockResolvedValue(undefined),
};

jest.mock('../../../../routes/users/contact-changes', () => mockContactChangesFns);

const mockPreferencesFns = {
  getDashboardStats: jest.fn<any>().mockResolvedValue(undefined),
  getUserStats: jest.fn<any>().mockResolvedValue(undefined),
  searchUsers: jest.fn<any>().mockResolvedValue(undefined),
};

jest.mock('../../../../routes/users/preferences', () => mockPreferencesFns);

const mockDevicesFns = {
  getFriendRequests: jest.fn<any>().mockResolvedValue(undefined),
  getAffiliateToken: jest.fn<any>().mockResolvedValue(undefined),
};

jest.mock('../../../../routes/users/devices', () => mockDevicesFns);

const mockBlockingFns = {
  blockUser: jest.fn<any>().mockResolvedValue(undefined),
  unblockUser: jest.fn<any>().mockResolvedValue(undefined),
  getBlockedUsers: jest.fn<any>().mockResolvedValue(undefined),
};

jest.mock('../../../../routes/users/blocking', () => mockBlockingFns);

const mockPresenceFns = {
  getUsersPresence: jest.fn<any>().mockResolvedValue(undefined),
};

jest.mock('../../../../routes/users/presence', () => mockPresenceFns);

const mockContactsMatchFns = {
  matchContacts: jest.fn<any>().mockResolvedValue(undefined),
};

jest.mock('../../../../routes/users/contacts-match', () => mockContactsMatchFns);

const mockContactsDirectoryFns = {
  syncContactsDirectory: jest.fn<any>().mockResolvedValue(undefined),
  getContactsDirectory: jest.fn<any>().mockResolvedValue(undefined),
  clearContactsDirectory: jest.fn<any>().mockResolvedValue(undefined),
};

jest.mock('../../../../routes/users/contacts-directory', () => mockContactsDirectoryFns);

// ─── Import after mocks ───────────────────────────────────────────────────────

import { userRoutes } from '../../../../routes/users/index';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('userRoutes — registers all route handler groups', () => {
  it('calls every route registration function with the fastify instance', async () => {
    const mockFastify = {} as any;

    await userRoutes(mockFastify);

    // Profile routes
    expect(mockProfileFns.updateUserProfile).toHaveBeenCalledWith(mockFastify);
    expect(mockProfileFns.updateUserAvatar).toHaveBeenCalledWith(mockFastify);
    expect(mockProfileFns.updateUserBanner).toHaveBeenCalledWith(mockFastify);
    expect(mockProfileFns.updateUserPassword).toHaveBeenCalledWith(mockFastify);
    expect(mockProfileFns.updateUsername).toHaveBeenCalledWith(mockFastify);
    expect(mockProfileFns.getUserByUsername).toHaveBeenCalledWith(mockFastify);
    expect(mockProfileFns.getUserById).toHaveBeenCalledWith(mockFastify);
    expect(mockProfileFns.getUserByEmail).toHaveBeenCalledWith(mockFastify);
    expect(mockProfileFns.getUserByIdDedicated).toHaveBeenCalledWith(mockFastify);
    expect(mockProfileFns.getUserByPhone).toHaveBeenCalledWith(mockFastify);

    // Contact change routes — surface unifiée (#4341) d'abord
    expect(mockContactChangesFns.initiateContactChange).toHaveBeenCalledWith(mockFastify);
    expect(mockContactChangesFns.verifyContactChange).toHaveBeenCalledWith(mockFastify);
    expect(mockContactChangesFns.resendContactChangeVerification).toHaveBeenCalledWith(mockFastify);
    expect(mockContactChangesFns.getContactChangeStatus).toHaveBeenCalledWith(mockFastify);

    // Anciennes adresses (#4184) — dépréciées, montées en alias
    expect(mockContactFns.initiateEmailChange).toHaveBeenCalledWith(mockFastify);
    expect(mockContactFns.verifyEmailChange).toHaveBeenCalledWith(mockFastify);
    expect(mockContactFns.resendEmailChangeVerification).toHaveBeenCalledWith(mockFastify);
    expect(mockContactFns.initiatePhoneChange).toHaveBeenCalledWith(mockFastify);
    expect(mockContactFns.verifyPhoneChange).toHaveBeenCalledWith(mockFastify);

    // Preferences routes
    expect(mockPreferencesFns.getDashboardStats).toHaveBeenCalledWith(mockFastify);
    expect(mockPreferencesFns.getUserStats).toHaveBeenCalledWith(mockFastify);
    expect(mockPreferencesFns.searchUsers).toHaveBeenCalledWith(mockFastify);

    // Devices/friends routes
    expect(mockDevicesFns.getFriendRequests).toHaveBeenCalledWith(mockFastify);
    // `sendFriendRequest` et `respondToFriendRequest` ont été SUPPRIMÉES
    // (#4162) : c'étaient les jumelles orphelines d'une famille complète, que
    // personne n'appelait, et dont la seule garde propre a été récupérée dans
    // `directory/friend-requests-core.ts` avant leur retrait.
    expect(mockDevicesFns.getAffiliateToken).toHaveBeenCalledWith(mockFastify);

    // Blocking routes
    expect(mockBlockingFns.blockUser).toHaveBeenCalledWith(mockFastify);
    expect(mockBlockingFns.unblockUser).toHaveBeenCalledWith(mockFastify);
    expect(mockBlockingFns.getBlockedUsers).toHaveBeenCalledWith(mockFastify);

    // Presence routes
    expect(mockPresenceFns.getUsersPresence).toHaveBeenCalledWith(mockFastify);

    // Contacts matching route
    expect(mockContactsMatchFns.matchContacts).toHaveBeenCalledWith(mockFastify);

    // Répertoire persisté
    expect(mockContactsDirectoryFns.syncContactsDirectory).toHaveBeenCalledWith(mockFastify);
    expect(mockContactsDirectoryFns.getContactsDirectory).toHaveBeenCalledWith(mockFastify);
    expect(mockContactsDirectoryFns.clearContactsDirectory).toHaveBeenCalledWith(mockFastify);
  });
});
