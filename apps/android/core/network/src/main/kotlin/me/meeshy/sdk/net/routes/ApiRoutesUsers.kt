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

public object ApiRoutesUsers {
    public const val BY_ID: String = "users/{id}"
    public const val BY_USER_ID_AFFILIATE_TOKEN: String = "users/{userId}/affiliate-token"
    public const val BY_USER_ID_BLOCK: String = "users/{userId}/block"
    public const val BY_USER_ID_GAME: String = "users/{userId}/game"
    public const val BY_USER_ID_GAME_SHOWCASE: String = "users/{userId}/game/showcase"
    public const val BY_USER_ID_STATS: String = "users/{userId}/stats"
    public const val EMAIL_BY_EMAIL: String = "users/email/{email}"
    public const val FRIEND_REQUESTS: String = "users/friend-requests"
    public const val ID_BY_ID: String = "users/id/{id}"
    public const val ME: String = "users/me"
    public const val ME_AVATAR: String = "users/me/avatar"
    public const val ME_BANNER: String = "users/me/banner"
    public const val ME_BLOCKED_USERS: String = "users/me/blocked-users"
    public const val ME_CHANGE_EMAIL: String = "users/me/change-email"
    public const val ME_CHANGE_PHONE: String = "users/me/change-phone"
    public const val ME_CONTACT_CHANGES: String = "users/me/contact-changes"
    public const val ME_CONTACT_CHANGES_BY_CHANNEL_RESEND: String = "users/me/contact-changes/{channel}/resend"
    public const val ME_CONTACT_CHANGES_BY_CHANNEL_VERIFY: String = "users/me/contact-changes/{channel}/verify"
    public const val ME_CONTACTS: String = "users/me/contacts"
    public const val ME_CONTACTS_MATCH: String = "users/me/contacts/match"
    public const val ME_CONTACTS_SYNC: String = "users/me/contacts/sync"
    public const val ME_DASHBOARD_STATS: String = "users/me/dashboard-stats"
    public const val ME_DEVICES: String = "users/me/devices"
    public const val ME_DEVICES_BY_DEVICE_ID: String = "users/me/devices/{deviceId}"
    public const val ME_PASSWORD: String = "users/me/password"
    public const val ME_REFERRAL_CODE: String = "users/me/referral-code"
    public const val ME_RESEND_EMAIL_CHANGE_VERIFICATION: String = "users/me/resend-email-change-verification"
    public const val ME_STATS: String = "users/me/stats"
    public const val ME_STATS_ACHIEVEMENTS: String = "users/me/stats/achievements"
    public const val ME_STATS_TIMELINE: String = "users/me/stats/timeline"
    public const val ME_USERNAME: String = "users/me/username"
    public const val ME_VERIFY_EMAIL_CHANGE: String = "users/me/verify-email-change"
    public const val ME_VERIFY_PHONE_CHANGE: String = "users/me/verify-phone-change"
    public const val PHONE_BY_PHONE: String = "users/phone/{phone}"
    public const val PRESENCE: String = "users/presence"
    public const val REGISTER_DEVICE_TOKEN: String = "users/register-device-token"
    public const val SEARCH: String = "users/search"
}
