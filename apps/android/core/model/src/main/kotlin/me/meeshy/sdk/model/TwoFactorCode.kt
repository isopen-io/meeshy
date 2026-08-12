package me.meeshy.sdk.model

/**
 * Pure validation for 2FA code inputs — mirrors the gateway's zod schemas
 * (`services/gateway/src/validation/two-factor-schemas.ts`) so the client can gate a
 * submit button locally instead of round-tripping an obviously malformed code.
 */
object TwoFactorCode {
    private const val TOTP_LENGTH = 6
    private val DISABLE_CODE_LENGTHS = 6..8

    /** `enable`/`backup-codes`: exactly 6 digits (`EnableBodySchema`/`BackupCodesBodySchema`). */
    fun isValidTotp(code: String): Boolean =
        code.length == TOTP_LENGTH && code.all(Char::isDigit)

    /** `disable`: a live TOTP or a backup code — 6 to 8 alphanumeric chars (`DisableBodySchema`). */
    fun isValidDisableCode(code: String): Boolean =
        code.length in DISABLE_CODE_LENGTHS && code.all(Char::isLetterOrDigit)
}
