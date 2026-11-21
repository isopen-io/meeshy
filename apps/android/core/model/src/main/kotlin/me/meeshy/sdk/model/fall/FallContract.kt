package me.meeshy.sdk.model.fall

import java.time.Instant
import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import me.meeshy.sdk.model.inactivity.InactivityLastBattery
import me.meeshy.sdk.model.inactivity.InactivityLastBatteryWire
import me.meeshy.sdk.model.inactivity.InactivityLastPosition
import me.meeshy.sdk.model.inactivity.InactivityLastPositionWire

/**
 * LA CHUTE DÉTECTÉE (#18748, SAN-01), côté Android — la lecture Kotlin de `packages/shared/types/fall-detection.ts`.
 * Android ne DÉTECTE rien (aucune source standard) : il reçoit, affiche, et règle ce qu'il partage à chaque Sang.
 * JAMAIS un message de conversation : la SyncPill (qui défile puis disparaît), le push générique, et l'état de
 * l'en-tête, de la fiche et du profil, qui respecte `expiresAt`.
 *
 * Les charges DESCENDANTES sont tolérantes : un champ inconnu est ignoré, une position ou une batterie illisible se
 * tait sans perdre l'état, une annonce d'un genre inconnu est écartée, une raison inconnue vaut [FallClearedReason.WITHDRAWN].
 */
public object FallContract {
    /**
     * Les types du push (#18748, audit : rien de santé ne part chez Apple ni Google) : l'alerte GÉNÉRIQUE aux Sangs, et
     * sa levée, poussée sous la même clé de regroupement — elle REMPLACE l'alerte, et retire l'état comme `fall:cleared`.
     */
    public const val SAFETY_ALERT_PUSH_TYPE: String = "safety_alert"
    public const val SAFETY_ALERT_CLEARED_PUSH_TYPE: String = "safety_alert_cleared"

    public val PUSH_TYPES: Set<String> = linkedSetOf(SAFETY_ALERT_PUSH_TYPE, SAFETY_ALERT_CLEARED_PUSH_TYPE)

    /** La personne dont la levée poussée retire l'état ; `null` pour tout autre push. */
    public fun clearedUserId(data: Map<String, String>): String? =
        data["userId"]?.trim()?.takeIf { it.isNotEmpty() && data["type"] == SAFETY_ALERT_CLEARED_PUSH_TYPE }
}

/** `FALL_CLEARED_REASONS`. Une raison inconnue de ce client se lit [WITHDRAWN] : l'état ne m'est plus servi. */
public enum class FallClearedReason(public val wire: String) {
    RESPONDED("responded"),
    EXPIRED("expired"),
    WITHDRAWN("withdrawn");

    public companion object {
        public fun of(wire: String?): FallClearedReason = entries.firstOrNull { it.wire == wire } ?: WITHDRAWN
    }
}

/** L'état servi à UN Sang : la chute (à la minute), l'expiration, et ce qui lui est DÉJÀ partagé. */
public data class FallState(
    val userId: String,
    val detectedAtMillis: Long,
    val expiresAtMillis: Long,
    val lastPosition: InactivityLastPosition? = null,
    val lastBattery: InactivityLastBattery? = null,
) {
    public fun isLive(nowMillis: Long): Boolean = nowMillis < expiresAtMillis
}

/** Ce qu'un événement apporte : l'état (et l'instant de l'annonce qui défile), ou son effacement et sa raison. */
public sealed interface FallEvent {
    public val userId: String

    /** `fall:detected` ; [announcedAtMillis] non nul quand l'annonce doit défiler. */
    public data class Detected(val state: FallState, val announcedAtMillis: Long?) : FallEvent {
        override val userId: String get() = state.userId
    }

    /** `fall:cleared` : la personne a répondu, l'épisode a expiré, ou il ne m'est plus servi. */
    public data class Cleared(override val userId: String, val reason: FallClearedReason) : FallEvent
}

internal fun String?.fallMillis(): Long? = this?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }

private fun String?.servedId(): String? = this?.trim()?.takeIf { it.isNotEmpty() }

private val TOLERANT: Json = Json {
    ignoreUnknownKeys = true
    isLenient = true
    explicitNulls = false
    coerceInputValues = true
}

private fun <T> JsonElement?.decoded(json: Json, serializer: KSerializer<T>): T? =
    this?.takeIf { it is JsonObject }?.let { runCatching { json.decodeFromJsonElement(serializer, it) }.getOrNull() }

@Serializable
public data class FallStateWire(
    val userId: String? = null,
    val detectedAt: String? = null,
    val expiresAt: String? = null,
    val lastPosition: JsonElement? = null,
    val lastBattery: JsonElement? = null,
) {
    /** L'état borné, ou `null` si la charge sort du contrat (identité absente, date illisible). */
    public fun served(json: Json = TOLERANT): FallState? {
        val id = userId.servedId() ?: return null
        val detected = detectedAt.fallMillis() ?: return null
        val expires = expiresAt.fallMillis() ?: return null
        return FallState(
            userId = id,
            detectedAtMillis = detected,
            expiresAtMillis = expires,
            lastPosition = lastPosition.decoded(json, InactivityLastPositionWire.serializer())?.served(),
            lastBattery = lastBattery.decoded(json, InactivityLastBatteryWire.serializer())?.served(),
        )
    }
}

@Serializable
public data class FallAnnouncementWire(val kind: String? = null, val at: String? = null) {
    public fun servedAt(): Long? = if (kind == "detected") at.fallMillis() else null
}

/** `fall:detected` — l'état servi, et l'annonce quand elle doit défiler. */
@Serializable
public data class FallDetectedWire(
    val userId: String? = null,
    val state: FallStateWire? = null,
    val announcement: FallAnnouncementWire? = null,
) {
    public fun served(): FallEvent.Detected? {
        val servedState = state?.served() ?: return null
        if (userId != null && userId != servedState.userId) return null
        return FallEvent.Detected(servedState, announcement?.servedAt())
    }
}

/** `fall:cleared` — l'état disparaît, avec sa raison. */
@Serializable
public data class FallClearedWire(val userId: String? = null, val reason: String? = null) {
    public fun served(): FallEvent.Cleared? {
        val id = userId.servedId() ?: return null
        return FallEvent.Cleared(id, FallClearedReason.of(reason))
    }
}

/** `GET /relations/falls` — les épisodes servis. Un élément illisible est écarté, pas fatal. */
@Serializable
public data class FallSnapshotWire(val items: List<JsonElement> = emptyList()) {
    public fun served(json: Json): List<FallState> = items.mapNotNull { item ->
        runCatching { json.decodeFromJsonElement(FallStateWire.serializer(), item) }.getOrNull()?.served(json)
    }
}

/** `GET|PUT /relations/:userId/fall/settings` — ce que JE partage à l'autre, si ma montre détecte une chute. */
@Serializable
public data class FallPersonSettingsWire(val userId: String? = null, val shared: Boolean = false)

/** Le corps de `PUT /relations/:userId/fall/settings` (strict : `shared` seul). */
@Serializable
public data class FallPersonSettingsBody(val shared: Boolean)
