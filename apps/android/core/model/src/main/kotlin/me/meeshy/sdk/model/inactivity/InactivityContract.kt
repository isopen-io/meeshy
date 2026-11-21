package me.meeshy.sdk.model.inactivity

import java.time.Instant
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import me.meeshy.sdk.model.push.PushPayload

/**
 * LA VÉRIFICATION D'INACTIVITÉ (#18738, TEL-02), côté Android — la lecture Kotlin de
 * `packages/shared/types/inactivity-check.ts`. Même forme que le téléphone injoignable (#18737). JAMAIS un message de
 * conversation : la question « Tout va bien ? » posée à soi, la SyncPill (qui défile puis disparaît), le push dédié aux
 * Sangs, et l'état durable de l'en-tête, de la fiche et du profil. Le serveur seul décide qu'une alerte part : ce client
 * répond « Je vais bien », reçoit et affiche.
 *
 * Les charges DESCENDANTES sont tolérantes : un champ inconnu est ignoré, une position ou une batterie illisible se
 * tait sans perdre l'état, une annonce d'un genre inconnu est écartée.
 */
public object InactivityContract {
    /** `WELLNESS_CHECK_NOTIFICATION_TYPE` : « Tout va bien ? », adressé à soi. */
    public const val WELLNESS_CHECK_NOTIFICATION_TYPE: String = "wellness_check"

    /** `INACTIVITY_ALERT_NOTIFICATION_TYPE` : l'alerte et le retour, poussés aux Sangs. */
    public const val ALERT_NOTIFICATION_TYPE: String = "inactivity_alert"

    /** Les deux signaux de sécurité : aucun interrupteur par type ne les gouverne. */
    public val NOTIFICATION_TYPES: Set<String> = linkedSetOf(WELLNESS_CHECK_NOTIFICATION_TYPE, ALERT_NOTIFICATION_TYPE)

    /** `INACTIVITY_CHECK_CONFIG.stateTtlSeconds` (72 h) : la passerelle n'en garde pas plus, le cache non plus. */
    public const val STATE_TTL_MILLIS: Long = 259_200L * 1000L

    /** Le push est-il la question « Tout va bien ? », à laquelle le toucher ou « Je vais bien » répondent ? */
    public fun answersWellness(payload: PushPayload): Boolean =
        payload.type.equals(WELLNESS_CHECK_NOTIFICATION_TYPE, ignoreCase = true)
}

/** `INACTIVITY_DELAY_HOURS` + la coupure : le délai sans activité avant « Tout va bien ? ». Défaut : 12 h. */
public enum class InactivityDelayChoice(public val hours: Int?) {
    SIX_HOURS(6),
    TWELVE_HOURS(12),
    TWENTY_FOUR_HOURS(24),
    OFF(null);

    public companion object {
        public val DEFAULT: InactivityDelayChoice = TWELVE_HOURS

        /** `null` ⇒ coupée ; une valeur hors contrat se lit le défaut. */
        public fun of(hours: Int?): InactivityDelayChoice =
            if (hours == null) OFF else entries.firstOrNull { it.hours == hours } ?: DEFAULT
    }
}

/** `INACTIVITY_ANNOUNCEMENT_KINDS`. Un genre inconnu de ce client se lit `null` : l'annonce est ignorée. */
public enum class InactivityAnnouncementKind(public val wire: String) {
    ALERT("alert"),
    RESPONDED("responded");

    public companion object {
        public fun of(wire: String?): InactivityAnnouncementKind? = entries.firstOrNull { it.wire == wire }
    }
}

/** La dernière position, SEULEMENT quand elle est déjà partagée au lecteur. */
public data class InactivityLastPosition(
    val latitude: Double,
    val longitude: Double,
    val accuracy: Double?,
    val recordedAtMillis: Long,
)

/** La dernière batterie, SEULEMENT quand elle est déjà partagée au lecteur. */
public data class InactivityLastBattery(val level: Int, val measuredAtMillis: Long)

/** L'état d'UNE personne pendant l'alerte : depuis quand son téléphone ne montre plus d'activité. */
public data class InactivityAlertState(
    val userId: String,
    val inactiveSinceMillis: Long,
    val alertedAtMillis: Long,
    val lastPosition: InactivityLastPosition? = null,
    val lastBattery: InactivityLastBattery? = null,
)

/** Une annonce : c'est elle, et elle seule, qui fait défiler la SyncPill. */
public data class InactivityAnnouncement(
    val kind: InactivityAnnouncementKind,
    val inactiveSinceMillis: Long,
    val atMillis: Long,
)

/** Ce qu'un événement apporte à un lecteur : l'état (ou son effacement) et, parfois, une annonce à faire défiler. */
public sealed interface InactivityEvent {
    public val userId: String
    public val announcement: InactivityAnnouncement?

    /** `inactivity:alert`. */
    public data class Alert(
        val state: InactivityAlertState,
        override val announcement: InactivityAnnouncement?,
    ) : InactivityEvent {
        override val userId: String get() = state.userId
    }

    /** `inactivity:cleared` : la personne a répondu, ou l'alerte ne m'est plus servie — l'état disparaît. */
    public data class Cleared(
        override val userId: String,
        override val announcement: InactivityAnnouncement?,
    ) : InactivityEvent
}

internal fun String?.epochMillis(): Long? = this?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }

private fun String?.servedId(): String? = this?.trim()?.takeIf { it.isNotEmpty() }

private const val MAX_LATITUDE = 90.0
private const val MAX_LONGITUDE = 180.0
private const val MAX_LEVEL = 100

@Serializable
public data class InactivityLastPositionWire(
    val latitude: Double? = null,
    val longitude: Double? = null,
    val accuracy: Double? = null,
    val recordedAt: String? = null,
) {
    public fun served(): InactivityLastPosition? {
        val lat = latitude?.takeIf { it in -MAX_LATITUDE..MAX_LATITUDE } ?: return null
        val lon = longitude?.takeIf { it in -MAX_LONGITUDE..MAX_LONGITUDE } ?: return null
        val at = recordedAt.epochMillis() ?: return null
        return InactivityLastPosition(lat, lon, accuracy?.takeIf { it >= 0.0 }, at)
    }
}

@Serializable
public data class InactivityLastBatteryWire(val level: Int? = null, val measuredAt: String? = null) {
    public fun served(): InactivityLastBattery? {
        val served = level?.takeIf { it in 0..MAX_LEVEL } ?: return null
        val at = measuredAt.epochMillis() ?: return null
        return InactivityLastBattery(served, at)
    }
}

@Serializable
public data class InactivityAnnouncementWire(
    val kind: String? = null,
    val inactiveSince: String? = null,
    val at: String? = null,
) {
    public fun served(): InactivityAnnouncement? {
        val servedKind = InactivityAnnouncementKind.of(kind) ?: return null
        val since = inactiveSince.epochMillis() ?: return null
        val at = at.epochMillis() ?: return null
        return InactivityAnnouncement(servedKind, since, at)
    }
}

@Serializable
public data class InactivityAlertStateWire(
    val userId: String? = null,
    val inactiveSince: String? = null,
    val alertedAt: String? = null,
    val lastPosition: JsonElement? = null,
    val lastBattery: JsonElement? = null,
) {
    /** L'état borné, ou `null` si la charge sort du contrat (identité absente, date illisible). */
    public fun served(json: Json = TOLERANT): InactivityAlertState? {
        val id = userId.servedId() ?: return null
        val since = inactiveSince.epochMillis() ?: return null
        val alerted = alertedAt.epochMillis() ?: return null
        return InactivityAlertState(
            userId = id,
            inactiveSinceMillis = since,
            alertedAtMillis = alerted,
            lastPosition = lastPosition.decoded(json, InactivityLastPositionWire.serializer())?.served(),
            lastBattery = lastBattery.decoded(json, InactivityLastBatteryWire.serializer())?.served(),
        )
    }

    internal companion object {
        val TOLERANT: Json = Json {
            ignoreUnknownKeys = true
            isLenient = true
            explicitNulls = false
            coerceInputValues = true
        }
    }
}

private fun <T> JsonElement?.decoded(json: Json, serializer: kotlinx.serialization.KSerializer<T>): T? =
    this?.takeIf { it is JsonObject }?.let { runCatching { json.decodeFromJsonElement(serializer, it) }.getOrNull() }

/** `inactivity:alert` — l'état servi, et l'annonce quand elle doit défiler. */
@Serializable
public data class InactivityAlertWire(
    val userId: String? = null,
    val state: InactivityAlertStateWire? = null,
    val announcement: InactivityAnnouncementWire? = null,
) {
    public fun served(): InactivityEvent.Alert? {
        val servedState = state?.served() ?: return null
        if (userId != null && userId != servedState.userId) return null
        return InactivityEvent.Alert(servedState, announcement?.served())
    }
}

/** `inactivity:cleared` — l'état disparaît ; l'annonce du retour n'est présente que si elle doit défiler. */
@Serializable
public data class InactivityClearedWire(
    val userId: String? = null,
    val announcement: InactivityAnnouncementWire? = null,
) {
    public fun served(): InactivityEvent.Cleared? {
        val id = userId.servedId() ?: return null
        return InactivityEvent.Cleared(id, announcement?.served())
    }
}

/** `GET /relations/inactivity` — les alertes servies. Un élément illisible est écarté, pas fatal. */
@Serializable
public data class InactivitySnapshotWire(val items: List<JsonElement> = emptyList()) {
    public fun served(json: Json): List<InactivityAlertState> = items.mapNotNull { item ->
        runCatching { json.decodeFromJsonElement(InactivityAlertStateWire.serializer(), item) }.getOrNull()?.served(json)
    }
}

/** L'accusé de `POST /me/wellness/ok` : `tracked = false` quand cet appareil n'est pas le téléphone suivi. */
@Serializable
public data class WellnessOkResultWire(val tracked: Boolean = false)

/**
 * `GET|PUT /me/wellness/settings`. Un `null` EXPLICITE dit « coupée » ; un champ ABSENT (passerelle antérieure) se lit
 * le défaut.
 */
@Serializable
public data class WellnessSettingsWire(val delayHours: Int? = InactivityDelayChoice.DEFAULT.hours) {
    public fun choice(): InactivityDelayChoice = InactivityDelayChoice.of(delayHours)
}

/**
 * Le corps de `PUT /me/wellness/settings`, strict. Un objet JSON et non une classe : l'encodeur du client tait les nuls
 * (`explicitNulls = false`), or « coupée » doit partir en `"delayHours": null`.
 */
public object WellnessSettingsBody {
    public fun of(choice: InactivityDelayChoice): JsonObject =
        JsonObject(mapOf("delayHours" to (choice.hours?.let(::JsonPrimitive) ?: JsonNull)))
}

/** `GET|PUT /relations/:userId/inactivity/settings` — ce que JE partage à l'autre. */
@Serializable
public data class InactivityPersonSettingsWire(
    val userId: String? = null,
    val shared: Boolean = false,
)

/** Le corps de `PUT /relations/:userId/inactivity/settings` (strict : `shared` seul). */
@Serializable
public data class InactivityPersonSettingsBody(val shared: Boolean)
