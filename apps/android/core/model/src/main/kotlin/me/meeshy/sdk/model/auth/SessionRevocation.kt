package me.meeshy.sdk.model.auth

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Pourquoi la passerelle a fermé CETTE session : le `reason` de `auth:session-revoked` (miroir de iOS
 * `SessionRevocationReason`). Décodage TOLÉRANT : un motif que ce binaire ne connaît pas devient [UNKNOWN] et la session
 * se ferme quand même comme une déconnexion générique (#9223).
 */
enum class SessionRevocationReason(val wire: String?) {
    /** L'équipe Meeshy a fermé la session : l'administrateur n'est JAMAIS nommé. */
    ADMIN_REVOKE("admin_revoke"),

    /** Le membre l'a fermée depuis un autre de ses appareils. */
    USER_REVOKE("user_revoke"),
    PASSWORD_CHANGED("password_changed"),
    LOGOUT("logout"),
    LOGOUT_ALL_DEVICES("logout_all_devices"),
    SESSION_EXPIRED("session_expired"),
    ACTIVATION_REQUIRED("activation_required"),
    UNKNOWN(null),
    ;

    /** La fermeture appelle peut-être une question : on offre d'écrire à l'équipe. */
    val offersContact: Boolean get() = this == ADMIN_REVOKE || this == PASSWORD_CHANGED

    companion object {
        const val SUPPORT_ADDRESS: String = "support@meeshy.me"

        fun fromWire(value: String?): SessionRevocationReason =
            entries.firstOrNull { it.wire != null && it.wire == value } ?: UNKNOWN

        private val json = Json { ignoreUnknownKeys = true }

        /** Le motif porté par la charge `auth:session-revoked` (JSON brut) ; charge illisible ou sans motif = [UNKNOWN]. */
        fun fromSocketPayload(raw: String?): SessionRevocationReason {
            if (raw.isNullOrBlank()) return UNKNOWN
            val obj = runCatching { json.parseToJsonElement(raw) as? JsonObject }.getOrNull() ?: return UNKNOWN
            val reason = (obj["reason"] as? JsonPrimitive)?.takeIf { it.isString }?.content
            return fromWire(reason)
        }
    }
}

/**
 * La fermeture qu'on doit EXPLIQUER avant que l'utilisateur se reconnecte. Identifiable : deux fermetures successives sont
 * deux avis distincts ([id] + [receivedAtEpochMillis]).
 */
data class SessionRevocationNotice(
    val id: String,
    val reason: SessionRevocationReason,
    val receivedAtEpochMillis: Long,
)
