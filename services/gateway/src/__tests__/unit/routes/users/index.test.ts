/**
 * Unit tests for users index route (index.ts)
 * Verifies that userRoutes() registers all route handlers with fastify.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockProfileFns = {
  getUserTest: jest.fn<any>().mockResolvedValue(undefined),
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

const mockPreferencesFns = {
  getDashboardStats: jest.fn<any>().mockResolvedValue(undefined),
  getUserStats: jest.fn<any>().mockResolvedValue(undefined),
  searchUsers: jest.fn<any>().mockResolvedValue(undefined),
};

jest.mock('../../../../routes/users/preferences', () => mockPreferencesFns);

const mockDevicesFns = {
  getFriendRequests: jest.fn<any>().mockResolvedValue(undefined),
  sendFriendRequest: jest.fn<any>().mockResolvedValue(undefined),
  respondToFriendRequest: jest.fn<any>().mockResolvedValue(undefined),
  getAffiliateToken: jest.fn<any>().mockResolvedValue(undefined),
  getAllUsers: jest.fn<any>().mockResolvedValue(undefined),
  updateUserById: jest.fn<any>().mockResolvedValue(undefined),
  deleteUserById: jest.fn<any>().mockResolvedValue(undefined),
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

// ─── Import after mocks ───────────────────────────────────────────────────────

import { userRoutes } from '../../../../routes/users/index';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('userRoutes — registers all route handler groups', () => {
  it('calls every route registration function with the fastify instance', async () => {
    const mockFastify = {} as any;

    await userRoutes(mockFastify);

    // Profile routes
    expect(mockProfileFns.getUserTest).toHaveBeenCalledWith(mockFastify);
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

    // Contact change routes
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
    expect(mockDevicesFns.sendFriendRequest).toHaveBeenCalledWith(mockFastify);
    expect(mockDevicesFns.respondToFriendRequest).toHaveBeenCalledWith(mockFastify);
    expect(mockDevicesFns.getAffiliateToken).toHaveBeenCalledWith(mockFastify);
    expect(mockDevicesFns.getAllUsers).toHaveBeenCalledWith(mockFastify);
    expect(mockDevicesFns.updateUserById).toHaveBeenCalledWith(mockFastify);
    expect(mockDevicesFns.deleteUserById).toHaveBeenCalledWith(mockFastify);

    // Blocking routes
    expect(mockBlockingFns.blockUser).toHaveBeenCalledWith(mockFastify);
    expect(mockBlockingFns.unblockUser).toHaveBeenCalledWith(mockFastify);
    expect(mockBlockingFns.getBlockedUsers).toHaveBeenCalledWith(mockFastify);

    // Presence routes
    expect(mockPresenceFns.getUsersPresence).toHaveBeenCalledWith(mockFastify);
  });
});
