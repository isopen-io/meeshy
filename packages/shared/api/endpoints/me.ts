/**
 * Les adresses du groupe `me` du catalogue d'API Meeshy — GÉNÉRÉ, ne pas éditer à la main.
 *
 * Source : services/gateway/route-manifest.json. Régénérer après tout changement de route :
 *
 *   cd packages/shared && npm run api-endpoints:generate
 *
 * S'importe en espace de noms, ce qui laisse le bundler retirer chaque entrée non appelée :
 *
 *   import * as meEndpoints from '@meeshy/shared/api/endpoints/me';
 *
 * Les paramètres sont encodés ICI (encodeURIComponent) : passer la valeur brute.
 */

/** GET · POST /api/v1/me/account/deletion */
export const accountDeletion = '/api/v1/me/account/deletion';

/** GET · POST /api/v1/me/categories */
export const categories = '/api/v1/me/categories';

/** PATCH · DELETE /api/v1/me/categories/:categoryId */
export const categoriesByCategoryId = (categoryId: string): string => `/api/v1/me/categories/${encodeURIComponent(categoryId)}`;

/** POST /api/v1/me/categories/reorder */
export const categoriesReorder = '/api/v1/me/categories/reorder';

/** GET /api/v1/me/consents */
export const consents = '/api/v1/me/consents';

/** PUT /api/v1/me/consents/:purpose */
export const consentsByPurpose = (purpose: string): string => `/api/v1/me/consents/${encodeURIComponent(purpose)}`;

/** DELETE /api/v1/me/delete-account */
export const deleteAccount = '/api/v1/me/delete-account';

/** GET /api/v1/me/delete-account/cancel */
export const deleteAccountCancel = '/api/v1/me/delete-account/cancel';

/** GET /api/v1/me/delete-account/confirm */
export const deleteAccountConfirm = '/api/v1/me/delete-account/confirm';

/** GET /api/v1/me/delete-account/delete-now */
export const deleteAccountDeleteNow = '/api/v1/me/delete-account/delete-now';

/** GET /api/v1/me/engagement */
export const engagement = '/api/v1/me/engagement';

/** GET /api/v1/me/export */
const export_ = '/api/v1/me/export';
export { export_ as export };

/** POST /api/v1/me/game/chest/claim */
export const gameChestClaim = '/api/v1/me/game/chest/claim';

/** POST /api/v1/me/game/duo/:duoId/abandon */
export const gameDuoByDuoIdAbandon = (duoId: string): string => `/api/v1/me/game/duo/${encodeURIComponent(duoId)}/abandon`;

/** POST /api/v1/me/game/duo/:duoId/accept */
export const gameDuoByDuoIdAccept = (duoId: string): string => `/api/v1/me/game/duo/${encodeURIComponent(duoId)}/accept`;

/** POST /api/v1/me/game/duo/invite */
export const gameDuoInvite = '/api/v1/me/game/duo/invite';

/** POST /api/v1/me/game/flame/freezes */
export const gameFlameFreezes = '/api/v1/me/game/flame/freezes';

/** POST /api/v1/me/game/flame/relight */
export const gameFlameRelight = '/api/v1/me/game/flame/relight';

/** POST /api/v1/me/game/guide/seen */
export const gameGuideSeen = '/api/v1/me/game/guide/seen';

/** POST /api/v1/me/game/league/consent */
export const gameLeagueConsent = '/api/v1/me/game/league/consent';

/** GET /api/v1/me/game/league/friends */
export const gameLeagueFriends = '/api/v1/me/game/league/friends';

/** PUT /api/v1/me/game/league/pseudonym */
export const gameLeaguePseudonym = '/api/v1/me/game/league/pseudonym';

/** GET /api/v1/me/game/league/week */
export const gameLeagueWeek = '/api/v1/me/game/league/week';

/** POST /api/v1/me/game/missions/:missionId/reroll */
export const gameMissionsByMissionIdReroll = (missionId: string): string => `/api/v1/me/game/missions/${encodeURIComponent(missionId)}/reroll`;

/** POST /api/v1/me/game/prestige */
export const gamePrestige = '/api/v1/me/game/prestige';

/** PUT /api/v1/me/game/privacy */
export const gamePrivacy = '/api/v1/me/game/privacy';

/** POST /api/v1/me/game/season/seal */
export const gameSeasonSeal = '/api/v1/me/game/season/seal';

/** POST /api/v1/me/game/season/steps/:step/claim */
export const gameSeasonStepsByStepClaim = (step: string): string => `/api/v1/me/game/season/steps/${encodeURIComponent(step)}/claim`;

/** PUT /api/v1/me/game/showcase/order */
export const gameShowcaseOrder = '/api/v1/me/game/showcase/order';

/** PUT /api/v1/me/game/visibility */
export const gameVisibility = '/api/v1/me/game/visibility';

/** POST /api/v1/me/meesh/mint */
export const meeshMint = '/api/v1/me/meesh/mint';

/** GET · PATCH /api/v1/me/onboarding */
export const onboarding = '/api/v1/me/onboarding';

/** GET /api/v1/me/permissions */
export const permissions = '/api/v1/me/permissions';

/** GET · PATCH · DELETE /api/v1/me/preferences */
export const preferences = '/api/v1/me/preferences';

/** GET · PUT · PATCH · DELETE /api/v1/me/preferences/application */
export const preferencesApplication = '/api/v1/me/preferences/application';

/** GET · PUT · PATCH · DELETE /api/v1/me/preferences/audio */
export const preferencesAudio = '/api/v1/me/preferences/audio';

/** GET · POST /api/v1/me/preferences/categories */
export const preferencesCategories = '/api/v1/me/preferences/categories';

/** GET · PATCH · DELETE /api/v1/me/preferences/categories/:categoryId */
export const preferencesCategoriesByCategoryId = (categoryId: string): string => `/api/v1/me/preferences/categories/${encodeURIComponent(categoryId)}`;

/** POST /api/v1/me/preferences/categories/reorder */
export const preferencesCategoriesReorder = '/api/v1/me/preferences/categories/reorder';

/** GET · PUT · PATCH · DELETE /api/v1/me/preferences/document */
export const preferencesDocument = '/api/v1/me/preferences/document';

/** GET /api/v1/me/preferences/encryption */
export const preferencesEncryption = '/api/v1/me/preferences/encryption';

/** GET · PUT · PATCH · DELETE /api/v1/me/preferences/message */
export const preferencesMessage = '/api/v1/me/preferences/message';

/** GET · PUT · PATCH · DELETE /api/v1/me/preferences/notification */
export const preferencesNotification = '/api/v1/me/preferences/notification';

/** GET · PUT · PATCH · DELETE /api/v1/me/preferences/privacy */
export const preferencesPrivacy = '/api/v1/me/preferences/privacy';

/** GET · PUT · PATCH · DELETE /api/v1/me/preferences/video */
export const preferencesVideo = '/api/v1/me/preferences/video';

/** GET /api/v1/me */
export const root = '/api/v1/me';

/** GET /api/v1/me/starred-messages */
export const starredMessages = '/api/v1/me/starred-messages';

/** PUT · DELETE /api/v1/me/starred-messages/:messageId */
export const starredMessagesByMessageId = (messageId: string): string => `/api/v1/me/starred-messages/${encodeURIComponent(messageId)}`;

/** GET · POST /api/v1/me/stickers */
export const stickers = '/api/v1/me/stickers';

/** DELETE /api/v1/me/stickers/:stickerId */
export const stickersByStickerId = (stickerId: string): string => `/api/v1/me/stickers/${encodeURIComponent(stickerId)}`;

/** POST /api/v1/me/stickers/:stickerId/use */
export const stickersByStickerIdUse = (stickerId: string): string => `/api/v1/me/stickers/${encodeURIComponent(stickerId)}/use`;

/** GET · PUT /api/v1/me/terms */
export const terms = '/api/v1/me/terms';
