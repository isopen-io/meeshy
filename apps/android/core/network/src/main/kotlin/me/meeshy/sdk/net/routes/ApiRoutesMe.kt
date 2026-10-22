// GÉNÉRÉ — ne pas éditer à la main.
//
// Source : services/gateway/route-manifest.json, via la MÊME dérivation que le
// catalogue TypeScript (packages/shared/api/build-catalog.ts). Régénérer après
// tout changement de route :
//
//   cd packages/shared && npm run android-endpoints:generate
//
// Les chemins sont relatifs au préfixe d'API (/api/v1/) ; les emplacements {nom}
// sont résolus par @Path. Les routes hors /api/v1 gardent leur chemin complet.

package me.meeshy.sdk.net.routes

public object ApiRoutesMe {
    public const val ACCOUNT_DELETION: String = "me/account/deletion"
    public const val BIRTH_DATE: String = "me/birth-date"
    public const val CATEGORIES: String = "me/categories"
    public const val CATEGORIES_BY_CATEGORY_ID: String = "me/categories/{categoryId}"
    public const val CATEGORIES_REORDER: String = "me/categories/reorder"
    public const val CONSENTS: String = "me/consents"
    public const val CONSENTS_BY_PURPOSE: String = "me/consents/{purpose}"
    public const val DELETE_ACCOUNT: String = "me/delete-account"
    public const val DELETE_ACCOUNT_CANCEL: String = "me/delete-account/cancel"
    public const val DELETE_ACCOUNT_CONFIRM: String = "me/delete-account/confirm"
    public const val DELETE_ACCOUNT_DELETE_NOW: String = "me/delete-account/delete-now"
    public const val ENGAGEMENT: String = "me/engagement"
    public const val EXPORT: String = "me/export"
    public const val GAME_CHEST_CLAIM: String = "me/game/chest/claim"
    public const val GAME_DUO_BY_DUO_ID_ABANDON: String = "me/game/duo/{duoId}/abandon"
    public const val GAME_DUO_BY_DUO_ID_ACCEPT: String = "me/game/duo/{duoId}/accept"
    public const val GAME_DUO_INVITE: String = "me/game/duo/invite"
    public const val GAME_FLAME_FREEZES: String = "me/game/flame/freezes"
    public const val GAME_FLAME_RELIGHT: String = "me/game/flame/relight"
    public const val GAME_FRAMES_ATMOSPHERE: String = "me/game/frames/atmosphere"
    public const val GAME_GUIDE_SEEN: String = "me/game/guide/seen"
    public const val GAME_LEAGUE_CONSENT: String = "me/game/league/consent"
    public const val GAME_LEAGUE_FRIENDS: String = "me/game/league/friends"
    public const val GAME_LEAGUE_PSEUDONYM: String = "me/game/league/pseudonym"
    public const val GAME_LEAGUE_WEEK: String = "me/game/league/week"
    public const val GAME_LEAGUE_WEEKS_BY_WEEK_KEY: String = "me/game/league/weeks/{weekKey}"
    public const val GAME_MISSIONS_BY_MISSION_ID_REROLL: String = "me/game/missions/{missionId}/reroll"
    public const val GAME_PHOTO_MOMENTS_INVITATIONS: String = "me/game/photo-moments/invitations"
    public const val GAME_PHOTO_MOMENTS_KEPT: String = "me/game/photo-moments/kept"
    public const val GAME_PHOTO_MOMENTS_PRESENTED: String = "me/game/photo-moments/presented"
    public const val GAME_PRESTIGE: String = "me/game/prestige"
    public const val GAME_PRIVACY: String = "me/game/privacy"
    public const val GAME_SEASONS_BY_NUMBER: String = "me/game/seasons/{number}"
    public const val GAME_SEASONS_CALENDAR: String = "me/game/seasons/calendar"
    public const val GAME_SEASON_SEAL: String = "me/game/season/seal"
    public const val GAME_SEASON_STEPS_BY_STEP_CLAIM: String = "me/game/season/steps/{step}/claim"
    public const val GAME_SHOWCASE_ORDER: String = "me/game/showcase/order"
    public const val GAME_VISIBILITY: String = "me/game/visibility"
    public const val MEESH_MINT: String = "me/meesh/mint"
    public const val ONBOARDING: String = "me/onboarding"
    public const val PERMISSIONS: String = "me/permissions"
    public const val PREFERENCES: String = "me/preferences"
    public const val PREFERENCES_APPLICATION: String = "me/preferences/application"
    public const val PREFERENCES_AUDIO: String = "me/preferences/audio"
    public const val PREFERENCES_CATEGORIES: String = "me/preferences/categories"
    public const val PREFERENCES_CATEGORIES_BY_CATEGORY_ID: String = "me/preferences/categories/{categoryId}"
    public const val PREFERENCES_CATEGORIES_REORDER: String = "me/preferences/categories/reorder"
    public const val PREFERENCES_DOCUMENT: String = "me/preferences/document"
    public const val PREFERENCES_ENCRYPTION: String = "me/preferences/encryption"
    public const val PREFERENCES_MESSAGE: String = "me/preferences/message"
    public const val PREFERENCES_NOTIFICATION: String = "me/preferences/notification"
    public const val PREFERENCES_PRIVACY: String = "me/preferences/privacy"
    public const val PREFERENCES_VIDEO: String = "me/preferences/video"
    public const val PROFILE_DECOR: String = "me/profile-decor"
    public const val ROOT: String = "me"
    public const val SECURITY_EVENTS: String = "me/security-events"
    public const val STARRED_MESSAGES: String = "me/starred-messages"
    public const val STARRED_MESSAGES_BY_MESSAGE_ID: String = "me/starred-messages/{messageId}"
    public const val STICKERS: String = "me/stickers"
    public const val STICKERS_BY_STICKER_ID: String = "me/stickers/{stickerId}"
    public const val STICKERS_BY_STICKER_ID_USE: String = "me/stickers/{stickerId}/use"
    public const val TERMS: String = "me/terms"
}
