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

public object ApiRoutesAuth {
    public const val CHECK_AVAILABILITY: String = "auth/check-availability"
    public const val FORGOT_PASSWORD: String = "auth/forgot-password"
    public const val FORGOT_PASSWORD_PHONE_LOOKUP: String = "auth/forgot-password/phone/lookup"
    public const val FORGOT_PASSWORD_PHONE_RESEND: String = "auth/forgot-password/phone/resend"
    public const val FORGOT_PASSWORD_PHONE_VERIFY_CODE: String = "auth/forgot-password/phone/verify-code"
    public const val FORGOT_PASSWORD_PHONE_VERIFY_IDENTITY: String = "auth/forgot-password/phone/verify-identity"
    public const val LOGIN: String = "auth/login"
    public const val LOGIN_N2_FA: String = "auth/login/2fa"
    public const val LOGOUT: String = "auth/logout"
    public const val MAGIC_LINK_REQUEST: String = "auth/magic-link/request"
    public const val MAGIC_LINK_VALIDATE: String = "auth/magic-link/validate"
    public const val ME: String = "auth/me"
    public const val N2_FA_BACKUP_CODES: String = "auth/2fa/backup-codes"
    public const val N2_FA_CANCEL: String = "auth/2fa/cancel"
    public const val N2_FA_DISABLE: String = "auth/2fa/disable"
    public const val N2_FA_ENABLE: String = "auth/2fa/enable"
    public const val N2_FA_SETUP: String = "auth/2fa/setup"
    public const val N2_FA_STATUS: String = "auth/2fa/status"
    public const val N2_FA_VERIFY: String = "auth/2fa/verify"
    public const val PHONE_TRANSFER_CANCEL: String = "auth/phone-transfer/cancel"
    public const val PHONE_TRANSFER_CHECK: String = "auth/phone-transfer/check"
    public const val PHONE_TRANSFER_INITIATE: String = "auth/phone-transfer/initiate"
    public const val PHONE_TRANSFER_INITIATE_REGISTRATION: String = "auth/phone-transfer/initiate-registration"
    public const val PHONE_TRANSFER_RESEND: String = "auth/phone-transfer/resend"
    public const val PHONE_TRANSFER_VERIFY: String = "auth/phone-transfer/verify"
    public const val PHONE_TRANSFER_VERIFY_REGISTRATION: String = "auth/phone-transfer/verify-registration"
    public const val REFRESH: String = "auth/refresh"
    public const val REGISTER: String = "auth/register"
    public const val RESEND_VERIFICATION: String = "auth/resend-verification"
    public const val RESET_PASSWORD: String = "auth/reset-password"
    public const val RESET_PASSWORD_VERIFY_TOKEN: String = "auth/reset-password/verify-token"
    public const val REVOKE_ALL_SESSIONS: String = "auth/revoke-all-sessions"
    public const val SEND_PHONE_CODE: String = "auth/send-phone-code"
    public const val SESSIONS: String = "auth/sessions"
    public const val SESSIONS_BY_SESSION_ID: String = "auth/sessions/{sessionId}"
    public const val VERIFICATION_STATUS: String = "auth/verification/status"
    public const val VERIFY_EMAIL: String = "auth/verify-email"
    public const val VERIFY_PHONE: String = "auth/verify-phone"
}
