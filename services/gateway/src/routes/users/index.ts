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

// Contact change routes (email/phone with verification) — anciennes adresses,
// dépréciées et montées en alias (#4341).
import {
  initiateEmailChange,
  verifyEmailChange,
  resendEmailChangeVerification,
  initiatePhoneChange,
  verifyPhoneChange
} from './contact-change';

// Contact change routes — surface unifiée `/me/contact-changes` (#4341,
// suivi de #4184). Remplace les cinq imports ci-dessus, qui restent montés
// en alias le temps que le compteur d'adoption de #4275 constate l'abandon.
import {
  initiateContactChange,
  verifyContactChange,
  resendContactChangeVerification,
  getContactChangeStatus
} from './contact-changes';

// Preferences routes
import {
  getDashboardStats,
  getUserStats,
  searchUsers
} from './preferences';

// Devices & social routes
import {
  getFriendRequests,
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

  // Contact change routes — surface unifiée d'abord (#4341), anciennes
  // adresses ensuite : les deux se lisent dans l'ordre où un lecteur du
  // fichier les découvre, du canonique vers l'alias.
  await initiateContactChange(fastify);
  await verifyContactChange(fastify);
  await resendContactChangeVerification(fastify);
  await getContactChangeStatus(fastify);

  // Anciennes adresses (email/phone avec vérification) — dépréciées, montées
  // en alias (#4341).
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
