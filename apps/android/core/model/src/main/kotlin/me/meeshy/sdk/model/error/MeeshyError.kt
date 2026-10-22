package me.meeshy.sdk.model.error

import me.meeshy.sdk.model.net.EndpointAuthKind
import me.meeshy.sdk.model.net.EndpointRejectionPolicy
import me.meeshy.sdk.model.net.RetryDecision

public enum class NetworkErrorKind(public val label: String) {
    NO_CONNECTION("Pas de connexion internet"),
    TIMEOUT("La requête a expiré"),
    SERVER_UNREACHABLE("Serveur inaccessible"),
}

public enum class AuthErrorKind(public val label: String) {
    INVALID_CREDENTIALS("Identifiants invalides"),
    SESSION_EXPIRED("Session expirée, veuillez vous reconnecter"),
}

/** Un refus typé (400 / 409, 429 quotidien) : le code machine, le champ visé, les appoints. */
public data class MeeshyRejection(
    val statusCode: Int,
    val message: String,
    val code: String? = null,
    val fieldName: String? = null,
    val suggestions: List<String> = emptyList(),
)

/**
 * La taxonomie d'erreurs du transport — miroir de `MeeshyError` (iOS, `MeeshyError.swift`).
 * Chaque catégorie expose un [label] FR et un [iconName] pour les états d'erreur et hors
 * ligne des écrans.
 */
public sealed class MeeshyError {
    public abstract val label: String
    public abstract val iconName: String

    public data class Network(val kind: NetworkErrorKind) : MeeshyError() {
        override val label: String get() = kind.label
        override val iconName: String get() = ICON_OFFLINE
    }

    public data class Auth(val kind: AuthErrorKind, val reason: String? = null) : MeeshyError() {
        override val label: String get() = reason ?: kind.label
        override val iconName: String get() = ICON_AUTH
    }

    /** 403 : l'identité reste valide, c'est CETTE ressource qui est fermée. Jamais une session morte. */
    public data class Forbidden(val reason: String? = null) : MeeshyError() {
        override val label: String get() = reason ?: "Accès refusé à cette ressource"
        override val iconName: String get() = ICON_FORBIDDEN
    }

    public data class Rejected(val rejection: MeeshyRejection) : MeeshyError() {
        override val label: String get() = rejection.message
        override val iconName: String get() = ICON_REJECTED
    }

    public data class Server(val statusCode: Int, val message: String) : MeeshyError() {
        override val label: String get() = message
        override val iconName: String get() = ICON_SERVER
    }

    public data class Unknown(val detail: String? = null) : MeeshyError() {
        override val label: String get() = detail ?: "Une erreur est survenue"
        override val iconName: String get() = ICON_UNKNOWN
    }

    public companion object {
        public const val ICON_OFFLINE: String = "wifi_off"
        public const val ICON_AUTH: String = "lock"
        public const val ICON_SERVER: String = "dns"
        public const val ICON_FORBIDDEN: String = "lock_open"
        public const val ICON_REJECTED: String = "error"
        public const val ICON_UNKNOWN: String = "warning"

        public val INVALID_URL: MeeshyError = Server(0, "URL invalide")
        public val DECODING: MeeshyError = Server(0, "Erreur de décodage des données")

        /**
         * Classe une réponse d'échec. L'ORDRE est le contrat (miroir de
         * `APIFailureVerdict.classify`) : 426 → refus structuré (réservé aux routes qui le
         * déclarent, fermé à 401/403/429) → 401 → 403 → limite du jour → 429 → 5xx → défaut.
         */
        public fun fromHttp(
            statusCode: Int,
            message: String?,
            authKind: EndpointAuthKind = EndpointAuthKind.BEARER,
            rejectionPolicy: EndpointRejectionPolicy = EndpointRejectionPolicy.OPAQUE,
            code: String? = null,
            fieldName: String? = null,
            suggestions: List<String> = emptyList(),
        ): MeeshyError = when {
            statusCode == 426 -> Server(426, message ?: "Mise à jour requise")
            rejectionPolicy == EndpointRejectionPolicy.STRUCTURED &&
                statusCode in 400..499 && statusCode !in setOf(401, 403, 429) ->
                Rejected(MeeshyRejection(statusCode, message ?: "Erreur inconnue", code, fieldName, suggestions))
            statusCode == 401 ->
                if (authKind == EndpointAuthKind.CREDENTIALS) {
                    Auth(AuthErrorKind.INVALID_CREDENTIALS, message)
                } else {
                    Auth(AuthErrorKind.SESSION_EXPIRED)
                }
            statusCode == 403 -> Forbidden(message)
            statusCode == 429 && code in RetryDecision.NEVER_REPLAYED_429_CODES ->
                Rejected(MeeshyRejection(429, message ?: "Limite du jour atteinte", code))
            statusCode == 429 -> Server(429, "Trop de requêtes")
            statusCode >= 500 -> Server(statusCode, message ?: "Erreur serveur")
            else -> Server(statusCode, message ?: "Erreur inconnue")
        }
    }
}
