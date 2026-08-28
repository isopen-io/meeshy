import type { FastifyInstance } from 'fastify';

// Profile routes
import {
  updateUserProfile,
  updateUserAvatar,
  updateUserBanner,
  updateUserPassword,
  updateUsername,
  getUserByUsername,
  getUserById,
  getUserByEmail,
  getUserByIdDedicated,
  getUserByPhone
} from './profile';

// Contact change routes (email/phone with verification)
import {
  initiateEmailChange,
  verifyEmailChange,
  resendEmailChangeVerification,
  initiatePhoneChange,
  verifyPhoneChange
} from './contact-change';

// Preferences routes
import {
  getDashboardStats,
  getUserStats,
  searchUsers
} from './preferences';

// Devices & social routes
import {
  getFriendRequests,
  sendFriendRequest,
  respondToFriendRequest,
  getAffiliateToken,
} from './devices';

// Blocking routes
import {
  blockUser,
  unblockUser,
  getBlockedUsers
} from './blocking';

// Contacts matching route (address book → platform users)
import { matchContacts } from './contacts-match';

// Contacts directory routes (persisted address book)
import {
  syncContactsDirectory,
  getContactsDirectory,
  clearContactsDirectory
} from './contacts-directory';

// Presence routes (runtime online status)
import { getUsersPresence } from './presence';

/**
 * Main user routes registration
 * Aggregates all user-related routes from modular files
 */
export async function userRoutes(fastify: FastifyInstance) {
  // NOTE: Username availability check has been moved to /auth/check-availability
  // which supports username, email, and phone number checks in a unified API

  // Profile routes
  await updateUserProfile(fastify);
  await updateUserAvatar(fastify);
  await updateUserBanner(fastify);
  await updateUserPassword(fastify);
  await updateUsername(fastify);
  await getUserByUsername(fastify);
  await getUserById(fastify);
  await getUserByEmail(fastify);
  await getUserByIdDedicated(fastify);
  await getUserByPhone(fastify);

  // Contact change routes (email/phone with verification)
  await initiateEmailChange(fastify);
  await verifyEmailChange(fastify);
  await resendEmailChangeVerification(fastify);
  await initiatePhoneChange(fastify);
  await verifyPhoneChange(fastify);

  // Preferences & stats routes
  await getDashboardStats(fastify);
  await getUserStats(fastify);
  await searchUsers(fastify);

  // Friend requests & affiliate routes
  await getFriendRequests(fastify);
  await sendFriendRequest(fastify);
  await respondToFriendRequest(fastify);
  await getAffiliateToken(fastify);

  // Blocking routes
  await blockUser(fastify);
  await unblockUser(fastify);
  await getBlockedUsers(fastify);

  // Contacts matching (address book → platform users)
  await matchContacts(fastify);

  // Répertoire persisté (sync / list / erase)
  await syncContactsDirectory(fastify);
  await getContactsDirectory(fastify);
  await clearContactsDirectory(fastify);

  // Presence routes
  await getUsersPresence(fastify);
}
