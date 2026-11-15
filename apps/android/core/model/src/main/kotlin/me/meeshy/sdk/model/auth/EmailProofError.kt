package me.meeshy.sdk.model.auth

/**
 * Ce qu'un refus de preuve d'adresse DIT sous le champ du code — miroir d'`EmailProofRefusal` +
 * `EmailProofErrorText` (iOS `EmailProofErrorText.swift`).
 *
 * L'écran lit le CODE machine posé par la passerelle et rend la phrase de son catalogue, dans la langue de
 * l'interface : jamais le `message` du serveur, même en repli.
 */
enum class EmailProofError {
    INVALID_CODE,
    EXPIRED_CODE,
    WEAK_PASSWORD,
    TOO_MANY_ATTEMPTS,
    OFFLINE,
    RESEND_FAILED,
    GENERIC,
    ;

    companion object {
        private const val WEAK_PASSWORD_CODE = "WEAK_PASSWORD"

        /** La saisie du code (`POST /auth/verify-email`). */
        fun forVerification(code: String?, httpStatus: Int?): EmailProofError {
            if (code?.trim()?.uppercase() == WEAK_PASSWORD_CODE) return WEAK_PASSWORD
            return when (CredentialRefusal.classify(code, httpStatus)) {
                CredentialRefusal.OFFLINE -> OFFLINE
                CredentialRefusal.TOO_MANY_ATTEMPTS -> TOO_MANY_ATTEMPTS
                CredentialRefusal.INVALID_CODE -> INVALID_CODE
                CredentialRefusal.EXPIRED_CODE -> EXPIRED_CODE
                CredentialRefusal.REJECTED, CredentialRefusal.UNEXPECTED -> GENERIC
            }
        }

        /** Le renvoi du code : seuls le réseau et le limiteur ont une phrase propre. */
        fun forResend(code: String?, httpStatus: Int?): EmailProofError =
            when (val error = forVerification(code, httpStatus)) {
                OFFLINE, TOO_MANY_ATTEMPTS -> error
                else -> RESEND_FAILED
            }
    }
}
