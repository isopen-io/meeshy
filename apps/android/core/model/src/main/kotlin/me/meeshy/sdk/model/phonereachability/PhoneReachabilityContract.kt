package me.meeshy.sdk.model.phonereachability

import java.time.Instant
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement

/**
 * LE TÉLÉPHONE INJOIGNABLE (#18737, TEL-01), côté Android — la lecture Kotlin de `packages/shared/types/phone-reachability.ts`
 * et `phone-reachability-constants.ts`. Même forme que la batterie (#14147). JAMAIS un message de conversation : la
 * SyncPill (qui défile puis disparaît), le push dédié, et l'état durable de l'en-tête, de l'avatar, de la fiche et du
 * profil. Le serveur seul décide qu'un téléphone est injoignable (deux sondes sans réponse) : ce client répond aux
 * sondes, reçoit et affiche.
 *
 * Les charges DESCENDANTES sont tolérantes : un champ inconnu est ignoré, une cause inconnue se lit
 * [PhoneUnreachableCause.UNKNOWN], une annonce d'un genre inconnu est écartée sans perdre l'état.
 */
public object PhoneReachabilityContract {
    /** `PHONE_REACHABILITY_NOTIFICATION_TYPE` : le push visible des annonces hors conversation. */
    public const val NOTIFICATION_TYPE: String = "device_unreachable"

    /** `PHONE_PROBE_PUSH_TYPE` : le push SILENCIEUX qui sonde le téléphone ; il répond par `POST /me/device/alive`. */
    public const val PROBE_PUSH_TYPE: String = "device_probe"

    /** `PHONE_REACHABILITY_CONFIG.stateTtlSeconds` (72 h) : la passerelle n'en garde pas plus, le cache non plus. */
    public const val STATE_TTL_MILLIS: Long = 259_200L * 1000L
}

/** `PHONE_UNREACHABLE_CAUSES` + `unknown` : la cause PROBABLE ; une cause ajoutée après ce client se lit [UNKNOWN]. */
public enum class PhoneUnreachableCause(public val wire: String) {
    BATTERY("battery"),
    NETWORK("network"),
    UNKNOWN("unknown");

    public companion object {
        public fun of(wire: String?): PhoneUnreachableCause = entries.firstOrNull { it.wire == wire } ?: UNKNOWN
    }
}

/** `PHONE_REACHABILITY_ANNOUNCEMENT_KINDS`. Un genre inconnu de ce client se lit `null` : l'annonce est ignorée. */
public enum class PhoneReachabilityAnnouncementKind(public val wire: String) {
    UNREACHABLE("unreachable"),
    REACHABLE("reachable");

    public companion object {
        public fun of(wire: String?): PhoneReachabilityAnnouncementKind? = entries.firstOrNull { it.wire == wire }
    }
}

/** L'état d'UNE personne : injoignable DEPUIS son dernier signe de vie, et pourquoi c'est probable. */
public data class PhoneReachabilityState(
    val userId: String,
    val unreachableSinceMillis: Long,
    val cause: PhoneUnreachableCause,
)

/** Une annonce : c'est elle, et elle seule, qui fait défiler la SyncPill. */
public data class PhoneReachabilityAnnouncement(
    val kind: PhoneReachabilityAnnouncementKind,
    val atMillis: Long,
)

/** Ce qu'un événement apporte à un lecteur : l'état (ou son effacement) et, parfois, une annonce à faire défiler. */
public sealed interface PhoneReachabilityEvent {
    public val userId: String
    public val announcement: PhoneReachabilityAnnouncement?

    /** `phone:unreachable`. */
    public data class Unreachable(
        val state: PhoneReachabilityState,
        override val announcement: PhoneReachabilityAnnouncement?,
    ) : PhoneReachabilityEvent {
        override val userId: String get() = state.userId
    }

    /** `phone:reachable` : le téléphone répond de nouveau, ou ne m'est plus servi — l'état disparaît. */
    public data class Reachable(
        override val userId: String,
        override val announcement: PhoneReachabilityAnnouncement?,
    ) : PhoneReachabilityEvent
}

private fun String?.epochMillis(): Long? = this?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }

private fun String?.servedId(): String? = this?.trim()?.takeIf { it.isNotEmpty() }

@Serializable
public data class PhoneReachabilityAnnouncementWire(
    val kind: String? = null,
    val at: String? = null,
) {
    public fun served(): PhoneReachabilityAnnouncement? {
        val servedKind = PhoneReachabilityAnnouncementKind.of(kind) ?: return null
        val at = at.epochMillis() ?: return null
        return PhoneReachabilityAnnouncement(servedKind, at)
    }
}

@Serializable
public data class PhoneReachabilityStateWire(
    val userId: String? = null,
    val unreachableSince: String? = null,
    val cause: String? = null,
) {
    /** L'état borné, ou `null` si la charge sort du contrat (identité absente, date illisible). */
    public fun served(): PhoneReachabilityState? {
        val id = userId.servedId() ?: return null
        val since = unreachableSince.epochMillis() ?: return null
        return PhoneReachabilityState(id, since, PhoneUnreachableCause.of(cause))
    }
}

/** `phone:unreachable` — l'état servi, et l'annonce quand mon canal est la SyncPill. */
@Serializable
public data class PhoneUnreachableWire(
    val userId: String? = null,
    val state: PhoneReachabilityStateWire? = null,
    val announcement: PhoneReachabilityAnnouncementWire? = null,
) {
    public fun served(): PhoneReachabilityEvent.Unreachable? {
        val servedState = state?.served() ?: return null
        if (userId != null && userId != servedState.userId) return null
        return PhoneReachabilityEvent.Unreachable(servedState, announcement?.served())
    }
}

/** `phone:reachable` — l'état disparaît ; l'annonce n'est présente que si mon canal est la SyncPill. */
@Serializable
public data class PhoneReachableWire(
    val userId: String? = null,
    val announcement: PhoneReachabilityAnnouncementWire? = null,
) {
    public fun served(): PhoneReachabilityEvent.Reachable? {
        val id = userId.servedId() ?: return null
        return PhoneReachabilityEvent.Reachable(id, announcement?.served())
    }
}

/** `GET /relations/phone-reachability` — les états servis. Un élément illisible est écarté, pas fatal. */
@Serializable
public data class PhoneReachabilitySnapshotWire(val items: List<JsonElement> = emptyList()) {
    public fun served(json: Json): List<PhoneReachabilityState> = items.mapNotNull { item ->
        runCatching { json.decodeFromJsonElement(PhoneReachabilityStateWire.serializer(), item) }.getOrNull()?.served()
    }
}

/** `GET /relations/:userId/phone-reachability` — `state` nul quand le téléphone répond ou que rien ne m'est partagé. */
@Serializable
public data class PhoneReachabilityStateResponseWire(val state: PhoneReachabilityStateWire? = null)

/** L'accusé de `POST /me/device/alive` : `tracked = false` quand cet appareil n'est pas le téléphone suivi. */
@Serializable
public data class PhoneAliveResultWire(val tracked: Boolean = false)

/** `GET|PUT /me/device/reachability/settings` — prévenir mes Proches, pour tous (le fantôme). Défaut : oui. */
@Serializable
public data class PhoneReachabilityEmitterSettings(val sharingEnabled: Boolean = true)

/** `GET|PUT /relations/:userId/phone-reachability/settings` — ce que JE partage à l'autre. */
@Serializable
public data class PhoneReachabilityPersonSettingsWire(
    val userId: String? = null,
    val shared: Boolean = false,
)

/** Le corps de `PUT /relations/:userId/phone-reachability/settings` (strict : `shared` seul). */
@Serializable
public data class PhoneReachabilityPersonSettingsBody(val shared: Boolean)
