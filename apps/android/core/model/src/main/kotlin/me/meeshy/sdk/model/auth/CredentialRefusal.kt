package me.meeshy.sdk.model.auth

/**
 * Ce qu'un refus de connexion, de second facteur ou de code de vérification DIT à l'écran.
 *
 * L'écran rend la phrase de son catalogue, dans la langue de l'interface. Seul un refus
 * client ([REJECTED] : identifiants refusés, compte verrouillé) laisse passer la raison de la
 * passerelle, comme iOS (`AuthError.invalidCredentialsWithMessage`) ; jamais le message
 * technique d'une panne de transport ou d'un décodage. Miroir d'`EmailProofRefusal` (iOS).
 */
public enum class CredentialRefusal {
    OFFLINE,
    TOO_MANY_ATTEMPTS,
    INVALID_CODE,
    EXPIRED_CODE,
    REJECTED,
    UNEXPECTED,
    ;

    /** La raison de la passerelle, quand ce refus a le droit de l'afficher et qu'elle dit quelque chose. */
    public fun serverReason(message: String?): String? =
        message?.trim()?.takeIf { this == REJECTED && it.isNotEmpty() }

    public companion object {
        private const val NETWORK_CODE = "NETWORK"
        private val RATE_LIMITED_CODES = setOf("RATE_LIMITED", "RATE_LIMIT_EXCEEDED")
        private const val INVALID_VERIFICATION_CODE = "INVALID_VERIFICATION"
        private const val VERIFICATION_EXPIRED_CODE = "VERIFICATION_EXPIRED"
        private val TECHNICAL_CODES = setOf("PARSE", "INVALID_URL", "UNSUPPORTED_LOGIN_RESPONSE")

        public fun classify(code: String?, httpStatus: Int?): CredentialRefusal {
            val normalized = code?.trim()?.uppercase()
            return when {
                normalized == NETWORK_CODE -> OFFLINE
                httpStatus == 429 || normalized in RATE_LIMITED_CODES -> TOO_MANY_ATTEMPTS
                normalized == INVALID_VERIFICATION_CODE -> INVALID_CODE
                normalized == VERIFICATION_EXPIRED_CODE -> EXPIRED_CODE
                normalized in TECHNICAL_CODES -> UNEXPECTED
                httpStatus == null || httpStatus in 400..499 -> REJECTED
                else -> UNEXPECTED
            }
        }
    }
}
