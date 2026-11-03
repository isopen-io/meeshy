package me.meeshy.sdk.model.auth

/**
 * Les étapes de la connexion (iOS `LoginView` : formulaire, étape `requires2FA`, session ouverte).
 * Le jeton de second facteur vit ici seulement le temps de l'étape : il n'est jamais écrit
 * dans l'état sauvegardé de l'écran.
 */
public sealed interface LoginFlow {
    public data object Form : LoginFlow
    public data class TwoFactor(val token: String) : LoginFlow
    public data object Authenticated : LoginFlow

    public fun reduce(event: LoginFlowEvent): LoginFlow = when (this) {
        Authenticated -> this
        Form -> when (event) {
            is LoginFlowEvent.ChallengeIssued -> if (event.token.isBlank()) this else TwoFactor(event.token)
            LoginFlowEvent.Succeeded -> Authenticated
            else -> this
        }
        is TwoFactor -> when (event) {
            LoginFlowEvent.Cancelled -> Form
            LoginFlowEvent.Succeeded -> Authenticated
            is LoginFlowEvent.Refused -> if (event.refusal == TwoFactorRefusal.TOKEN_EXPIRED) Form else this
            is LoginFlowEvent.ChallengeIssued -> if (event.token.isBlank()) this else TwoFactor(event.token)
        }
    }
}

public sealed interface LoginFlowEvent {
    public data class ChallengeIssued(val token: String) : LoginFlowEvent
    public data object Cancelled : LoginFlowEvent
    public data object Succeeded : LoginFlowEvent
    public data class Refused(val refusal: TwoFactorRefusal) : LoginFlowEvent
}

/** Ce que la passerelle refuse à l'étape du code : chaque cause a son libellé sous le champ. */
public enum class TwoFactorRefusal {
    OFFLINE,
    TOO_MANY_ATTEMPTS,
    TOKEN_EXPIRED,
    INVALID_CODE,
    UNEXPECTED,
    ;

    public companion object {
        private val RATE_LIMITED_CODES = setOf("RATE_LIMITED", "RATE_LIMIT_EXCEEDED")
        private val TECHNICAL_CODES = setOf("PARSE", "INVALID_URL", "UNSUPPORTED_LOGIN_RESPONSE")

        /**
         * `POST /auth/login/2fa` répond 401 `TWO_FACTOR_FAILED` pour un jeton expiré, un verrou et un code
         * faux : seul le message les distingue (le 429 du limiteur est lisible par son statut).
         */
        public fun classify(code: String?, httpStatus: Int?, message: String?): TwoFactorRefusal {
            val normalized = code?.trim()?.uppercase()
            val text = message?.lowercase().orEmpty()
            return when {
                normalized == "NETWORK" -> OFFLINE
                httpStatus == 429 || normalized in RATE_LIMITED_CODES -> TOO_MANY_ATTEMPTS
                "trop de tentatives" in text || "too many attempts" in text -> TOO_MANY_ATTEMPTS
                "token 2fa" in text && ("expir" in text || "invalide" in text) -> TOKEN_EXPIRED
                normalized in TECHNICAL_CODES -> UNEXPECTED
                httpStatus == null || httpStatus in 400..499 -> INVALID_CODE
                else -> UNEXPECTED
            }
        }
    }
}
