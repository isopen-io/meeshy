package me.meeshy.sdk.model.composer.timeline

import me.meeshy.sdk.model.scene.StoryVolumeState
import me.meeshy.sdk.model.timeline.TimelineClipKind
import me.meeshy.sdk.model.timeline.TimelineProject

/** La fenêtre stockée d'un objet de la timeline, toutes familles confondues. */
internal data class ClipWindowEntry(val id: String, val start: Float, val duration: Float?)

internal fun TimelineProject.windows(): List<ClipWindowEntry> =
    mediaObjects.map { ClipWindowEntry(it.id, (it.startTime ?: 0.0).toFloat(), it.duration?.toFloat()) } +
        audioPlayerObjects.map { ClipWindowEntry(it.id, it.startTime ?: 0f, it.duration) } +
        textObjects.map { ClipWindowEntry(it.id, (it.startTime ?: 0.0).toFloat(), it.duration?.toFloat()) } +
        stickerObjects.map { ClipWindowEntry(it.id, (it.startTime ?: 0.0).toFloat(), it.duration?.toFloat()) } +
        locationObjects.map { ClipWindowEntry(it.id, (it.startTime ?: 0.0).toFloat(), it.duration?.toFloat()) }

internal fun TimelineProject.kindOf(id: String): TimelineClipKind? {
    mediaObjects.firstOrNull { it.id == id }?.let { return if (it.mediaType == "video") TimelineClipKind.VIDEO else TimelineClipKind.IMAGE }
    if (audioPlayerObjects.any { it.id == id }) return TimelineClipKind.AUDIO
    if (textObjects.any { it.id == id }) return TimelineClipKind.TEXT
    if (stickerObjects.any { it.id == id }) return TimelineClipKind.STICKER
    if (locationObjects.any { it.id == id }) return TimelineClipKind.PLACE
    return null
}

internal fun TimelineProject.startOf(id: String): Float? = windows().firstOrNull { it.id == id }?.start

internal fun TimelineProject.durationOf(id: String): Float? = windows().firstOrNull { it.id == id }?.duration

/** La durée de la source d'un média : une vidéo de 3 s ne s'étire pas à 30 s. */
internal fun TimelineProject.nativeDurationLimit(id: String): Float? =
    mediaObjects.firstOrNull { it.id == id }?.intrinsicDuration?.toFloat()

internal fun TimelineProject.volumeOf(id: String): Float? =
    mediaObjects.firstOrNull { it.id == id }?.volume ?: audioPlayerObjects.firstOrNull { it.id == id }?.volume

internal fun TimelineProject.volumeStateOf(id: String): StoryVolumeState? =
    mediaObjects.firstOrNull { it.id == id }?.let { StoryVolumeState(it.volume, it.mutedVolumeMemento) }
        ?: audioPlayerObjects.firstOrNull { it.id == id }?.let { StoryVolumeState(it.volume, it.mutedVolumeMemento) }

internal fun TimelineProject.fadeInOf(id: String): Double? =
    mediaObjects.firstOrNull { it.id == id }?.fadeIn
        ?: audioPlayerObjects.firstOrNull { it.id == id }?.fadeIn?.toDouble()
        ?: textObjects.firstOrNull { it.id == id }?.fadeIn

internal fun TimelineProject.fadeOutOf(id: String): Double? =
    mediaObjects.firstOrNull { it.id == id }?.fadeOut
        ?: audioPlayerObjects.firstOrNull { it.id == id }?.fadeOut?.toDouble()
        ?: textObjects.firstOrNull { it.id == id }?.fadeOut
