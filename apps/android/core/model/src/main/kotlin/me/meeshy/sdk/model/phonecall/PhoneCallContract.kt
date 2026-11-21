package me.meeshy.sdk.model.phonecall

import java.time.Instant
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement

/**
 * « EN APPEL » (#18753, ACT-01), côté Android — la lecture Kotlin de `packages/shared/types/phone-call.ts`. Même forme
 * que le téléphone injoignable (#18737) et la vérification d'inactivité (#18738). JAMAIS un message de conversation, ni
 * un push : l'état de l'en-tête, de la fiche et du profil (« En appel depuis 12 min »), et la SyncPill quand une
 * annonce arrive. Jamais d'interlocuteur : le contrat n'en porte aucun.
 *
 * Les charges DESCENDANTES sont tolérantes : un champ inconnu est ignoré, une annonce d'un genre inconnu est écartée.
 * Un état porte `expiresAt` : passé ce délai, il ne s'affiche plus (le téléphone n'a peut-être jamais dit la fin).
 */
public object PhoneCallContract {
    /** `PHONE_CALL_CONFIG.reportTtlMinutes` (180) : au-delà, la passerelle ne sert plus l'état. */
    public const val REPORT_TTL_MILLIS: Long = 180L * 60L * 1000L
}

/** `PHONE_CALL_ANNOUNCEMENT_KINDS`. Un genre inconnu de ce client se lit `null` : l'annonce est ignorée. */
public enum class PhoneCallAnnouncementKind(public val wire: String) {
    STARTED("started"),
    ENDED("ended");

    public companion object {
        public fun of(wire: String?): PhoneCallAnnouncementKind? = entries.firstOrNull { it.wire == wire }
    }
}

/** L'état d'UNE personne en appel : depuis quand (arrondi par la passerelle), et quand il cesse d'être servi. */
public data class PhoneCallState(
    val userId: String,
    val sinceMillis: Long,
    val expiresAtMillis: Long,
) {
    /** Un état dont l'expiration est passée ne s'affiche plus. */
    public fun isLiveAt(nowMillis: Long): Boolean = nowMillis < expiresAtMillis
}

/** Une annonce : c'est elle, et elle seule, qui fait défiler la SyncPill. */
public data class PhoneCallAnnouncement(val kind: PhoneCallAnnouncementKind, val atMillis: Long)

/** Ce qu'un événement apporte à un lecteur : l'état (ou son effacement) et, parfois, une annonce à faire défiler. */
public sealed interface PhoneCallEvent {
    public val userId: String
    public val announcement: PhoneCallAnnouncement?

    /** `phone-call:started` — sans annonce, une mise à jour silencieuse : l'état REMPLACE celui tenu. */
    public data class Started(
        val state: PhoneCallState,
        override val announcement: PhoneCallAnnouncement?,
    ) : PhoneCallEvent {
        override val userId: String get() = state.userId
    }

    /** `phone-call:ended` : l'appel est fini, ou ne m'est plus servi — l'état disparaît. */
    public data class Ended(
        override val userId: String,
        override val announcement: PhoneCallAnnouncement?,
    ) : PhoneCallEvent
}

private fun String?.epochMillis(): Long? = this?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }

private fun String?.servedId(): String? = this?.trim()?.takeIf { it.isNotEmpty() }

@Serializable
public data class PhoneCallAnnouncementWire(val kind: String? = null, val at: String? = null) {
    public fun served(): PhoneCallAnnouncement? {
        val servedKind = PhoneCallAnnouncementKind.of(kind) ?: return null
        val at = at.epochMillis() ?: return null
        return PhoneCallAnnouncement(servedKind, at)
    }
}

@Serializable
public data class PhoneCallStateWire(
    val userId: String? = null,
    val since: String? = null,
    val expiresAt: String? = null,
) {
    /** L'état borné, ou `null` si la charge sort du contrat (identité absente, date illisible). */
    public fun served(): PhoneCallState? {
        val id = userId.servedId() ?: return null
        val start = since.epochMillis() ?: return null
        val expiry = expiresAt.epochMillis() ?: return null
        return PhoneCallState(id, start, expiry)
    }
}

/** `phone-call:started` — l'état servi, et l'annonce quand elle doit défiler. */
@Serializable
public data class PhoneCallStartedWire(
    val userId: String? = null,
    val state: PhoneCallStateWire? = null,
    val announcement: PhoneCallAnnouncementWire? = null,
) {
    public fun served(): PhoneCallEvent.Started? {
        val servedState = state?.served() ?: return null
        if (userId != null && userId != servedState.userId) return null
        return PhoneCallEvent.Started(servedState, announcement?.served())
    }
}

/** `phone-call:ended` — l'état disparaît ; l'annonce du raccroché n'est présente que si elle doit défiler. */
@Serializable
public data class PhoneCallEndedWire(
    val userId: String? = null,
    val announcement: PhoneCallAnnouncementWire? = null,
) {
    public fun served(): PhoneCallEvent.Ended? {
        val id = userId.servedId() ?: return null
        return PhoneCallEvent.Ended(id, announcement?.served())
    }
}

/** `GET /relations/phone-calls` — les états servis. Un élément illisible est écarté, pas fatal. */
@Serializable
public data class PhoneCallSnapshotWire(val items: List<JsonElement> = emptyList()) {
    public fun served(json: Json): List<PhoneCallState> = items.mapNotNull { item ->
        runCatching { json.decodeFromJsonElement(PhoneCallStateWire.serializer(), item) }.getOrNull()?.served()
    }
}

/** Le corps de `POST /me/device/call` : UN booléen, rien d'autre (le schéma serveur est strict). */
@Serializable
public data class PhoneCallReportBody(val active: Boolean)

/** L'accusé d'un rapport : `tracked = false` quand cet appareil n'est pas le téléphone suivi. */
@Serializable
public data class PhoneCallAckWire(val tracked: Boolean = false)

/** `GET|PUT /me/device/call/settings` (lecture) — montrer à mes Sangs que je suis en appel. Absent : oui. */
@Serializable
public data class PhoneCallEmitterSettingsWire(val sharingEnabled: Boolean = true)

/**
 * Le corps de `PUT /me/device/call/settings`, SANS défaut : l'encodeur du client tait les défauts
 * (`encodeDefaults = false`), et un `{}` serait refusé par le schéma strict.
 */
@Serializable
public data class PhoneCallEmitterSettingsBody(val sharingEnabled: Boolean)

/** `GET|PUT /relations/:userId/phone-call/settings` — ce que JE partage à l'autre. */
@Serializable
public data class PhoneCallPersonSettingsWire(
    val userId: String? = null,
    val shared: Boolean = false,
)

/** Le corps de `PUT /relations/:userId/phone-call/settings` (strict : `shared` seul). */
@Serializable
public data class PhoneCallPersonSettingsBody(val shared: Boolean)
