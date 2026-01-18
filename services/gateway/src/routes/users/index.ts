import type { FastifyInstance } from 'fastify';

// Profile routes
import {
  getUserTest,
  updateUserProfile,
  updateUserAvatar,
  updateUserPassword,
  getUserByUsername,
  getUserById
} from './profile';

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
  getAllUsers,
  updateUserById,
  deleteUserById
} from './devices';

/**
 * Main user routes registration
 * Aggregates all user-related routes from modular files
 */
export async function userRoutes(fastify: FastifyInstance) {
  // NOTE: Username availability check has been moved to /auth/check-availability
  // which supports username, email, and phone number checks in a unified API

  // Profile routes
  await getUserTest(fastify);
  await updateUserProfile(fastify);
  await updateUserAvatar(fastify);
  await updateUserPassword(fastify);
  await getUserByUsername(fastify);
  await getUserById(fastify);

  // Preferences & stats routes
  await getDashboardStats(fastify);
  await getUserStats(fastify);
  await searchUsers(fastify);

  // Friend requests & affiliate routes
  await getFriendRequests(fastify);
  await sendFriendRequest(fastify);
  await respondToFriendRequest(fastify);
  await getAffiliateToken(fastify);

  // Stub routes
  await getAllUsers(fastify);
  await updateUserById(fastify);
  await deleteUserById(fastify);
}
