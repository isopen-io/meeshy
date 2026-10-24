package me.meeshy.sdk.model.analytics.v2

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement

/** Ce qui était À L'ÉCRAN au moment d'une capture : jamais l'image. */
data class SocialVisibleTarget(
    val kind: SocialTargetKind,
    val id: String,
    val visibleFraction: Double? = null,
) {
    internal fun toJson() = FieldsBuilder().apply {
        put("kind", kind.wire)
        put("id", id)
        put("visibleFraction", visibleFraction?.let(SocialEventV2Wire::fraction))
    }.build()
}

class SocialScreenCapture(
    val capture: Action,
    visibleTargets: List<SocialVisibleTarget>,
    recordingMs: Int? = null,
) : SocialEventV2Payload {
    enum class Action(val wire: String) {
        SCREENSHOT("screenshot"),
        RECORDING_STARTED("recording_started"),
        RECORDING_STOPPED("recording_stopped"),
    }

    /** `isCaptured` ne distingue pas un enregistrement d'une recopie : la valeur le DIT. */
    enum class CaptureKind(val wire: String) {
        SCREENSHOT("screenshot"),
        RECORDING_OR_MIRRORING("recording_or_mirroring"),
    }

    val visibleTargets: List<SocialVisibleTarget> = visibleTargets.take(SocialEventV2Wire.VISIBLE_TARGETS_MAX)
    val recordingMs: Int? = if (capture == Action.RECORDING_STOPPED) recordingMs?.coerceAtLeast(0) else null
    val captureKind: CaptureKind =
        if (capture == Action.SCREENSHOT) CaptureKind.SCREENSHOT else CaptureKind.RECORDING_OR_MIRRORING

    override val type get() = SocialEventV2Type.SCREEN_CAPTURE
    override val action get() = capture.wire

    override fun fields(): Map<String, JsonElement> = FieldsBuilder().apply {
        put("visibleTargets", JsonArray(visibleTargets.map { it.toJson() }))
        put("recordingMs", recordingMs)
        put("captureKind", captureKind.wire)
    }.build()
}

/** La visibilité MRC d'une impression, quand elle n'était pas connue au lot. */
class SocialVisibility(
    maxVisibleFraction: Double,
    visibleMs: Int,
    val viewable: Boolean,
    val impressionEventId: String? = null,
) : SocialEventV2Payload {
    val maxVisibleFraction: Double = SocialEventV2Wire.fraction(maxVisibleFraction)
    val visibleMs: Int = visibleMs.coerceAtLeast(0)

    override val type get() = SocialEventV2Type.VISIBILITY
    override val action get() = "measured"

    override fun fields(): Map<String, JsonElement> = FieldsBuilder().apply {
        put("maxVisibleFraction", maxVisibleFraction)
        put("visibleMs", visibleMs)
        put("viewable", viewable)
        put("impressionEventId", impressionEventId)
    }.build()
}

/** Le résumé d'une session de LISTING (fil, grille) : agrégé côté client, jamais une écriture par image. */
data class ScrollListingSummary(
    val listingSessionId: String,
    val segment: Int,
    val durationMs: Int,
    val activeScrollMs: Int,
    val itemsRendered: Int,
    val itemsViewable: Int,
    val maxPosition: Int,
    val distancePt: Int,
    /** Ms passées par classe de vitesse : <500, 500-1500, 1500-4000, >=4000 pt/s. */
    val velocityHistogram: List<Int>,
    val directionChanges: Int,
    val upDistanceRatio: Double,
    val flings: Int,
    val stops: Int,
    val refreshes: Int,
    val paginations: Int,
    val reachedEnd: Boolean,
) : SocialEventV2Payload {
    override val type get() = SocialEventV2Type.SCROLL
    override val action get() = "listing"

    override fun fields(): Map<String, JsonElement> = FieldsBuilder().apply {
        put("listingSessionId", listingSessionId)
        put("segment", segment)
        put("durationMs", durationMs)
        put("activeScrollMs", activeScrollMs)
        put("itemsRendered", itemsRendered)
        put("itemsViewable", itemsViewable)
        put("maxPosition", maxPosition)
        put("distancePt", distancePt)
        putInts("velocityHistogram", velocityHistogram)
        put("directionChanges", directionChanges)
        put("upDistanceRatio", SocialEventV2Wire.fraction(upDistanceRatio))
        put("flings", flings)
        put("stops", stops)
        put("refreshes", refreshes)
        put("paginations", paginations)
        put("reachedEnd", reachedEnd)
    }.build()
}

/** Le défilement À L'INTÉRIEUR d'un contenu (carrousel, texte long, commentaires...). */
data class ScrollContentSummary(
    val contentKind: ContentKind,
    val itemsTotal: Int,
    val maxIndexReached: Int,
    val swipes: Int,
    val maxScrollFraction: Double,
    val readThroughFraction: Double,
    val durationMs: Int,
) : SocialEventV2Payload {
    enum class ContentKind(val wire: String) {
        CAROUSEL("carousel"),
        LONG_TEXT("long_text"),
        COMMENTS("comments"),
        STORY_SLIDES("story_slides"),
        THREAD("thread"),
    }

    override val type get() = SocialEventV2Type.SCROLL
    override val action get() = "content"

    override fun fields(): Map<String, JsonElement> = FieldsBuilder().apply {
        put("contentKind", contentKind.wire)
        put("itemsTotal", itemsTotal)
        put("maxIndexReached", maxIndexReached)
        put("swipes", swipes)
        put("maxScrollFraction", SocialEventV2Wire.fraction(maxScrollFraction))
        put("readThroughFraction", SocialEventV2Wire.fraction(readThroughFraction))
        put("durationMs", durationMs)
    }.build()
}

/** La qualité d'une session de lecture (une seule action : `session`). */
data class PlaybackSummary(
    val playbackId: String,
    val mediaId: String,
    val mediaDurationMs: Int?,
    val startupMs: Int?,
    val exitBeforeStart: Boolean,
    val playedMs: Int,
    val rebufferCount: Int,
    val rebufferMs: Int,
    val errorCode: Int?,
    val errorDomain: String?,
    val avgBitrateKbps: Int?,
    val renditionChanges: Int,
    val loops: Int,
    val pauses: Int,
    val seeks: Int,
    val mutedAtStart: Boolean,
    val muteToggles: Int,
    val captionsOn: Boolean,
    /** Bitmask : 1 = 25 %, 2 = 50 %, 4 = 75 %, 8 = 100 %. */
    val quartiles: Int,
    val exitReason: ExitReason,
) : SocialEventV2Payload {
    enum class ExitReason(val wire: String) {
        COMPLETED("completed"),
        SWIPED("swiped"),
        CLOSED("closed"),
        BACKGROUNDED("backgrounded"),
        ERROR("error"),
        OTHER("other"),
    }

    override val type get() = SocialEventV2Type.PLAYBACK
    override val action get() = "session"

    override fun fields(): Map<String, JsonElement> = FieldsBuilder().apply {
        put("playbackId", playbackId)
        put("mediaId", mediaId)
        put("mediaDurationMs", mediaDurationMs)
        put("startupMs", startupMs)
        put("exitBeforeStart", exitBeforeStart)
        put("playedMs", playedMs)
        put("rebufferCount", rebufferCount)
        put("rebufferMs", rebufferMs)
        put("errorCode", errorCode)
        put("errorDomain", errorDomain)
        put("avgBitrateKbps", avgBitrateKbps)
        put("renditionChanges", renditionChanges)
        put("loops", loops)
        put("pauses", pauses)
        put("seeks", seeks)
        put("mutedAtStart", mutedAtStart)
        put("muteToggles", muteToggles)
        put("captionsOn", captionsOn)
        put("quartiles", quartiles)
        put("exitReason", exitReason.wire)
    }.build()
}
