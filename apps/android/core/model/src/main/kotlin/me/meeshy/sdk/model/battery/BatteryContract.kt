package me.meeshy.sdk.model.battery

import java.time.Instant
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement

/**
 * LA BATTERIE DES PROCHES ET DES SANGS (#14147), côté Android — la lecture Kotlin de `packages/shared/types/battery.ts`
 * et `battery-constants.ts`. JAMAIS un message de conversation : trois surfaces seulement (la SyncPill, le push dédié,
 * l'état de l'en-tête et de l'avatar). Le serveur seul fait avancer l'épisode (`batteryEpisodeStep`) : ce client relève,
 * reçoit et affiche — il ne décide d'aucun palier.
 *
 * Les charges DESCENDANTES sont tolérantes (champ inconnu ignoré, annonce d'un genre inconnu écartée, état hors contrat
 * écarté par [BatteryReaderStateWire.served]) : un client plus ancien que la passerelle ne casse pas.
 */
public object BatteryContract {
    /** `BATTERY_CONFIG.lowThreshold` : sous ce niveau (inclus), chaque palier compte. */
    public const val LOW_THRESHOLD: Int = 30

    /** `BATTERY_CONFIG.criticalThreshold` : à ce niveau ou dessous, chaque relevé compte, plus un battement. */
    public const val CRITICAL_THRESHOLD: Int = 5

    /** La largeur d'une tranche : au-dessus du seuil, un relevé à chaque changement de tranche de 5 %. */
    public const val BAND_WIDTH: Int = 5

    /** `BATTERY_CONFIG.pullCooldownMinutes` : un relevé à la demande au plus toutes les 5 min par paire (serveur). */
    public const val PULL_COOLDOWN_MINUTES: Int = 5

    /** `BATTERY_DEVICE_LABEL_MAX`. */
    public const val DEVICE_LABEL_MAX: Int = 60

    /** `BATTERY_NOTIFICATION_TYPE` : le push des annonces hors conversation. */
    public const val NOTIFICATION_TYPE: String = "device_battery"

    /** `BATTERY_PULL_PUSH_TYPE` : le push SILENCIEUX qui demande un relevé maintenant. */
    public const val PULL_PUSH_TYPE: String = "battery_pull"
}

/** `BATTERY_SERVED_PHASES` : hors épisode (`normal`), rien n'est servi et l'icône est cachée. */
public enum class BatteryPhase(public val wire: String) {
    LOW("low"),
    CRITICAL("critical"),
    OFF("off"),
    CHARGING("charging");

    public companion object {
        public fun of(wire: String?): BatteryPhase? = entries.firstOrNull { it.wire == wire }
    }
}

/** `BATTERY_ANNOUNCEMENT_KINDS`. Un genre inconnu de ce client se lit `null` : l'annonce est ignorée, l'état reste lu. */
public enum class BatteryAnnouncementKind(public val wire: String) {
    LOW("low"),
    THRESHOLD("threshold"),
    CRITICAL("critical"),
    CRITICAL_DROP("critical-drop"),
    PROBABLY_OFF("probably-off"),
    CHARGING("charging"),
    BACK_ON("back-on"),
    RECHARGED("recharged"),
    ENDED("ended");

    public companion object {
        public fun of(wire: String?): BatteryAnnouncementKind? = entries.firstOrNull { it.wire == wire }
    }
}

/**
 * `BATTERY_RECEIVE_MODES` — ce que je veux recevoir de la batterie d'une personne : tout ce que le contexte décide,
 * le critique seul en push, la SyncPill seule, ou rien. [ALL] est le défaut (`BATTERY_DEFAULT_RECEIVE_MODE`).
 */
public enum class BatteryReceiveMode(public val wire: String) {
    ALL("all"),
    CRITICAL("critical"),
    PILL("pill"),
    NONE("none");

    public companion object {
        public val DEFAULT: BatteryReceiveMode = ALL

        public fun of(wire: String?): BatteryReceiveMode = entries.firstOrNull { it.wire == wire } ?: DEFAULT
    }
}

/** L'état d'UNE personne tel que la passerelle me le sert, borné par le contrat. Servi seulement pendant un épisode. */
public data class BatteryState(
    val userId: String,
    val phase: BatteryPhase,
    val level: Int,
    val charging: Boolean,
    val lowPower: Boolean,
    val estimatedMinutes: Int?,
    val measuredAtMillis: Long,
    val deviceLabel: String?,
)

/** Une annonce : c'est elle, et elle seule, qui fait défiler la SyncPill. */
public data class BatteryAnnouncement(
    val kind: BatteryAnnouncementKind,
    val level: Int?,
    val threshold: Int?,
    val atMillis: Long,
)

/** Ce qu'un événement apporte à un lecteur : l'état (ou son effacement) et, parfois, une annonce à faire défiler. */
public sealed interface BatteryEvent {
    public val userId: String
    public val announcement: BatteryAnnouncement?

    public data class Changed(val state: BatteryState, override val announcement: BatteryAnnouncement?) : BatteryEvent {
        override val userId: String get() = state.userId
    }

    public data class Cleared(override val userId: String, override val announcement: BatteryAnnouncement?) : BatteryEvent
}

private fun String?.epochMillis(): Long? = this?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }

private fun Int?.percent(): Int? = this?.takeIf { it in 0..100 }

@Serializable
public data class BatteryAnnouncementWire(
    val kind: String? = null,
    val level: Int? = null,
    val threshold: Int? = null,
    val at: String? = null,
) {
    public fun served(): BatteryAnnouncement? {
        val servedKind = BatteryAnnouncementKind.of(kind) ?: return null
        val at = at.epochMillis() ?: return null
        return BatteryAnnouncement(servedKind, level.percent(), threshold.percent(), at)
    }
}

@Serializable
public data class BatteryReaderStateWire(
    val userId: String? = null,
    val phase: String? = null,
    val level: Int? = null,
    val charging: Boolean? = null,
    val lowPower: Boolean? = null,
    val estimatedMinutes: Int? = null,
    val measuredAt: String? = null,
    val deviceLabel: String? = null,
) {
    /** L'état borné, ou `null` si la charge sort du contrat (phase inconnue, niveau hors 0..100, date illisible). */
    public fun served(): BatteryState? {
        val id = userId?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        val servedPhase = BatteryPhase.of(phase) ?: return null
        val servedLevel = level.percent() ?: return null
        val measured = measuredAt.epochMillis() ?: return null
        return BatteryState(
            userId = id,
            phase = servedPhase,
            level = servedLevel,
            charging = charging ?: false,
            lowPower = lowPower ?: false,
            estimatedMinutes = estimatedMinutes?.takeIf { it >= 0 },
            measuredAtMillis = measured,
            deviceLabel = deviceLabel?.trim()?.takeIf { it.isNotEmpty() }?.take(BatteryContract.DEVICE_LABEL_MAX),
        )
    }
}

/** `battery:changed` — l'état servi, et l'annonce quand mon canal pour ce palier est la SyncPill. */
@Serializable
public data class BatteryChangedWire(
    val userId: String? = null,
    val state: BatteryReaderStateWire? = null,
    val announcement: BatteryAnnouncementWire? = null,
) {
    public fun served(): BatteryEvent.Changed? {
        val servedState = state?.served() ?: return null
        if (userId != null && userId != servedState.userId) return null
        return BatteryEvent.Changed(servedState, announcement?.served())
    }
}

/** `battery:cleared` — l'épisode est clos, ou ne m'est plus servi : l'icône disparaît. */
@Serializable
public data class BatteryClearedWire(
    val userId: String? = null,
    val announcement: BatteryAnnouncementWire? = null,
) {
    public fun served(): BatteryEvent.Cleared? {
        val id = userId?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        return BatteryEvent.Cleared(id, announcement?.served())
    }
}

/** `battery:pull-requested` — à l'émetteur : relever maintenant. Qui l'a demandé n'est pas dit. */
@Serializable
public data class BatteryPullRequestedWire(val requestedAt: String? = null)

/** `GET /relations/battery` — les épisodes en cours qu'on me sert. Un élément illisible est écarté, pas fatal. */
@Serializable
public data class BatterySnapshotWire(val items: List<JsonElement> = emptyList()) {
    public fun served(json: Json): List<BatteryState> = items.mapNotNull { item ->
        runCatching { json.decodeFromJsonElement(BatteryReaderStateWire.serializer(), item) }.getOrNull()?.served()
    }
}

/** `GET /relations/:userId/battery` — `state` nul hors épisode ou quand rien ne m'est partagé. */
@Serializable
public data class BatteryStateResponseWire(val state: BatteryReaderStateWire? = null)

/** Le corps de `POST /me/device/battery` (`batteryReportSchema`, strict : aucun champ en trop). */
@Serializable
public data class BatteryReportBody(
    val level: Int,
    val charging: Boolean,
    val lowPower: Boolean,
    val measuredAt: String,
    val deviceLabel: String? = null,
)

/** L'accusé d'un relevé : `tracked = false` quand cet appareil n'est pas le téléphone suivi (ou partage coupé). */
@Serializable
public data class BatteryReportResultWire(val tracked: Boolean = false)

/** L'accusé d'un relevé à la demande : rien ne revient si le relevé n'ouvre ni ne poursuit un épisode. */
@Serializable
public data class BatteryPullResultWire(val requestedAt: String? = null, val episodeOnly: Boolean = true)

/** `GET|PUT /me/device/battery/settings` — partager ma batterie, pour tous. */
@Serializable
public data class BatteryEmitterSettings(val sharingEnabled: Boolean = true)

/** `GET|PUT /relations/:userId/battery/settings` — ce que JE partage à l'autre, ce que je reçois de lui. */
@Serializable
public data class BatteryPersonSettingsWire(
    val userId: String? = null,
    val shared: Boolean = false,
    val receive: String? = null,
) {
    public val receiveMode: BatteryReceiveMode get() = BatteryReceiveMode.of(receive)
}

/** Le corps de `PUT /relations/:userId/battery/settings` : au moins un des deux champs (`.refine`). */
@Serializable
public data class BatteryPersonSettingsBody(val shared: Boolean? = null, val receive: String? = null)
