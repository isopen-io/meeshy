/**
 * Les adresses du groupe `users` du catalogue d'API Meeshy — GÉNÉRÉ, ne pas éditer à la main.
 *
 * Source : services/gateway/route-manifest.json. Régénérer après tout changement de route :
 *
 *   cd packages/shared && npm run api-endpoints:generate
 *
 * S'importe en espace de noms, ce qui laisse le bundler retirer chaque entrée non appelée :
 *
 *   import * as usersEndpoints from '@meeshy/shared/api/endpoints/users';
 *
 * Les paramètres sont encodés ICI (encodeURIComponent) : passer la valeur brute.
 */

/** GET /api/v1/users/:id */
export const byId = (id: string): string => `/api/v1/users/${encodeURIComponent(id)}`;

/** GET /api/v1/users/:userId/affiliate-token */
export const byUserIdAffiliateToken = (userId: string): string => `/api/v1/users/${encodeURIComponent(userId)}/affiliate-token`;

/** POST · DELETE /api/v1/users/:userId/block */
export const byUserIdBlock = (userId: string): string => `/api/v1/users/${encodeURIComponent(userId)}/block`;

/** GET /api/v1/users/:userId/stats */
export const byUserIdStats = (userId: string): string => `/api/v1/users/${encodeURIComponent(userId)}/stats`;

/** GET /api/v1/users/email/:email */
export const emailByEmail = (email: string): string => `/api/v1/users/email/${encodeURIComponent(email)}`;

/** GET /api/v1/users/friend-requests */
export const friendRequests = '/api/v1/users/friend-requests';

/** GET /api/v1/users/id/:id */
export const idById = (id: string): string => `/api/v1/users/id/${encodeURIComponent(id)}`;

/** PATCH /api/v1/users/me */
export const me = '/api/v1/users/me';

/** PATCH /api/v1/users/me/avatar */
export const meAvatar = '/api/v1/users/me/avatar';

/** PATCH /api/v1/users/me/banner */
export const meBanner = '/api/v1/users/me/banner';

/** GET /api/v1/users/me/blocked-users */
export const meBlockedUsers = '/api/v1/users/me/blocked-users';

/** POST /api/v1/users/me/change-email */
export const meChangeEmail = '/api/v1/users/me/change-email';

/** POST /api/v1/users/me/change-phone */
export const meChangePhone = '/api/v1/users/me/change-phone';

/** GET · POST /api/v1/users/me/contact-changes */
export const meContactChanges = '/api/v1/users/me/contact-changes';

/** POST /api/v1/users/me/contact-changes/:channel/resend */
export const meContactChangesByChannelResend = (channel: string): string => `/api/v1/users/me/contact-changes/${encodeURIComponent(channel)}/resend`;

/** POST /api/v1/users/me/contact-changes/:channel/verify */
export const meContactChangesByChannelVerify = (channel: string): string => `/api/v1/users/me/contact-changes/${encodeURIComponent(channel)}/verify`;

/** GET · DELETE /api/v1/users/me/contacts */
export const meContacts = '/api/v1/users/me/contacts';

/** POST /api/v1/users/me/contacts/match */
export const meContactsMatch = '/api/v1/users/me/contacts/match';

/** POST /api/v1/users/me/contacts/sync */
export const meContactsSync = '/api/v1/users/me/contacts/sync';

/** GET /api/v1/users/me/dashboard-stats */
export const meDashboardStats = '/api/v1/users/me/dashboard-stats';

/** GET /api/v1/users/me/devices */
export const meDevices = '/api/v1/users/me/devices';

/** DELETE /api/v1/users/me/devices/:deviceId */
export const meDevicesByDeviceId = (deviceId: string): string => `/api/v1/users/me/devices/${encodeURIComponent(deviceId)}`;

/** PATCH /api/v1/users/me/password */
export const mePassword = '/api/v1/users/me/password';

/** GET /api/v1/users/me/referral-code */
export const meReferralCode = '/api/v1/users/me/referral-code';

/** POST /api/v1/users/me/resend-email-change-verification */
export const meResendEmailChangeVerification = '/api/v1/users/me/resend-email-change-verification';

/** GET /api/v1/users/me/stats */
export const meStats = '/api/v1/users/me/stats';

/** GET /api/v1/users/me/stats/achievements */
export const meStatsAchievements = '/api/v1/users/me/stats/achievements';

/** GET /api/v1/users/me/stats/timeline */
export const meStatsTimeline = '/api/v1/users/me/stats/timeline';

/** PATCH /api/v1/users/me/username */
export const meUsername = '/api/v1/users/me/username';

/** POST /api/v1/users/me/verify-email-change */
export const meVerifyEmailChange = '/api/v1/users/me/verify-email-change';

/** POST /api/v1/users/me/verify-phone-change */
export const meVerifyPhoneChange = '/api/v1/users/me/verify-phone-change';

/** GET /api/v1/users/phone/:phone */
export const phoneByPhone = (phone: string): string => `/api/v1/users/phone/${encodeURIComponent(phone)}`;

/** GET /api/v1/users/presence */
export const presence = '/api/v1/users/presence';

/** POST · DELETE /api/v1/users/register-device-token */
export const registerDeviceToken = '/api/v1/users/register-device-token';

/** GET /api/v1/users/search */
export const search = '/api/v1/users/search';
