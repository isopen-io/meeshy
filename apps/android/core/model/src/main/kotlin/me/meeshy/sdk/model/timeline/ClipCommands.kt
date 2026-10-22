package me.meeshy.sdk.model.timeline

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StoryTextObject
import java.util.UUID

private fun newId(): String = UUID.randomUUID().toString()

private fun now(): Long = System.currentTimeMillis()

private const val STICKER_CANVAS_ONLY = "stickers are added on the canvas, not the timeline"
private const val PLACE_CANVAS_ONLY = "places are added on the canvas, not the timeline"

@Serializable
@SerialName("addClip")
data class AddClipCommand(
    override val id: String = newId(),
    override val timestamp: Long = now(),
    val clipId: String,
    val postMediaId: String,
    val kind: TimelineClipKind,
    val startTime: Float,
    val duration: Float,
    val content: String? = null,
    /** Rapport largeur/hauteur de la source, figé dans le média créé (1,0 pour les vieux brouillons). */
    val aspectRatio: Double = 1.0,
) : EditCommand {

    override fun apply(project: TimelineProject): TimelineProject = when (kind) {
        TimelineClipKind.VIDEO, TimelineClipKind.IMAGE -> project.copy(
            mediaObjects = project.mediaObjects + StoryMediaObject(
                id = clipId,
                postMediaId = postMediaId,
                mediaType = if (kind == TimelineClipKind.VIDEO) "video" else "image",
                placement = "media",
                aspectRatio = aspectRatio,
                startTime = startTime.toDouble(),
                duration = duration.toDouble(),
            ),
        )
        TimelineClipKind.AUDIO -> project.copy(
            audioPlayerObjects = project.audioPlayerObjects + StoryAudioPlayerObject(
                id = clipId,
                postMediaId = postMediaId,
                placement = "overlay",
                waveformSamples = emptyList(),
                startTime = startTime,
                duration = duration,
            ),
        )
        TimelineClipKind.TEXT -> project.copy(
            textObjects = project.textObjects + StoryTextObject(
                id = clipId,
                text = content.orEmpty(),
                startTime = startTime.toDouble(),
                duration = duration.toDouble(),
            ),
        )
        TimelineClipKind.STICKER -> throw EditCommandError.InvalidState(STICKER_CANVAS_ONLY)
        TimelineClipKind.PLACE -> throw EditCommandError.InvalidState(PLACE_CANVAS_ONLY)
    }

    override fun revert(project: TimelineProject): TimelineProject = when (kind) {
        TimelineClipKind.VIDEO, TimelineClipKind.IMAGE ->
            project.copy(mediaObjects = project.mediaObjects.filterNot { it.id == clipId })
        TimelineClipKind.AUDIO ->
            project.copy(audioPlayerObjects = project.audioPlayerObjects.filterNot { it.id == clipId })
        TimelineClipKind.TEXT ->
            project.copy(textObjects = project.textObjects.filterNot { it.id == clipId })
        TimelineClipKind.STICKER -> throw EditCommandError.InvalidState(STICKER_CANVAS_ONLY)
        TimelineClipKind.PLACE -> throw EditCommandError.InvalidState(PLACE_CANVAS_ONLY)
    }
}

@Serializable
@SerialName("deleteClip")
data class DeleteClipCommand(
    override val id: String = newId(),
    override val timestamp: Long = now(),
    val clipId: String,
    val kind: TimelineClipKind,
    val snapshotMedia: StoryMediaObject? = null,
    val snapshotAudio: StoryAudioPlayerObject? = null,
    val snapshotText: StoryTextObject? = null,
    val insertionIndex: Int,
) : EditCommand {

    override fun apply(project: TimelineProject): TimelineProject = when (kind) {
        TimelineClipKind.VIDEO, TimelineClipKind.IMAGE -> {
            if (project.mediaObjects.none { it.id == clipId }) throw EditCommandError.ClipNotFound(clipId)
            project.copy(mediaObjects = project.mediaObjects.filterNot { it.id == clipId })
        }
        TimelineClipKind.AUDIO -> {
            if (project.audioPlayerObjects.none { it.id == clipId }) throw EditCommandError.ClipNotFound(clipId)
            project.copy(audioPlayerObjects = project.audioPlayerObjects.filterNot { it.id == clipId })
        }
        TimelineClipKind.TEXT -> {
            if (project.textObjects.none { it.id == clipId }) throw EditCommandError.ClipNotFound(clipId)
            project.copy(textObjects = project.textObjects.filterNot { it.id == clipId })
        }
        TimelineClipKind.STICKER -> throw EditCommandError.InvalidState("stickers are removed on the canvas, not the timeline")
        TimelineClipKind.PLACE -> throw EditCommandError.InvalidState("places are removed on the canvas, not the timeline")
    }

    override fun revert(project: TimelineProject): TimelineProject = when (kind) {
        TimelineClipKind.VIDEO, TimelineClipKind.IMAGE -> {
            val snap = snapshotMedia ?: throw EditCommandError.InvalidState("missing media snapshot")
            project.copy(mediaObjects = project.mediaObjects.insertedAt(insertionIndex, snap))
        }
        TimelineClipKind.AUDIO -> {
            val snap = snapshotAudio ?: throw EditCommandError.InvalidState("missing audio snapshot")
            project.copy(audioPlayerObjects = project.audioPlayerObjects.insertedAt(insertionIndex, snap))
        }
        TimelineClipKind.TEXT -> {
            val snap = snapshotText ?: throw EditCommandError.InvalidState("missing text snapshot")
            project.copy(textObjects = project.textObjects.insertedAt(insertionIndex, snap))
        }
        TimelineClipKind.STICKER -> throw EditCommandError.InvalidState("stickers are removed on the canvas, not the timeline")
        TimelineClipKind.PLACE -> throw EditCommandError.InvalidState("places are removed on the canvas, not the timeline")
    }
}

internal fun <T> List<T>.insertedAt(index: Int, element: T): List<T> {
    val at = index.coerceIn(0, size)
    return toMutableList().also { it.add(at, element) }
}

@Serializable
@SerialName("moveClip")
data class MoveClipCommand(
    override val id: String = newId(),
    override val timestamp: Long = now(),
    val clipId: String,
    val kind: TimelineClipKind,
    val oldStartTime: Float,
    val newStartTime: Float,
) : EditCommand {

    override fun apply(project: TimelineProject) = withStart(project, newStartTime)

    override fun revert(project: TimelineProject) = withStart(project, oldStartTime)

    private fun withStart(project: TimelineProject, start: Float): TimelineProject = when (kind) {
        TimelineClipKind.VIDEO, TimelineClipKind.IMAGE -> project.updateMedia(clipId) { it.copy(startTime = start.toDouble()) }
        TimelineClipKind.AUDIO -> project.updateAudio(clipId) { it.copy(startTime = start) }
        TimelineClipKind.TEXT -> project.updateText(clipId) { it.copy(startTime = start.toDouble()) }
        TimelineClipKind.STICKER -> project.updateSticker(clipId) { it.copy(startTime = start.toDouble()) }
        TimelineClipKind.PLACE -> project.updatePlace(clipId) { it.copy(startTime = start.toDouble()) }
    }
}

@Serializable
@SerialName("trimClip")
data class TrimClipCommand(
    override val id: String = newId(),
    override val timestamp: Long = now(),
    val clipId: String,
    val kind: TimelineClipKind,
    val oldStartTime: Float,
    val oldDuration: Float,
    val newStartTime: Float,
    val newDuration: Float,
) : EditCommand {

    override fun apply(project: TimelineProject) = withWindow(project, newStartTime, newDuration)

    override fun revert(project: TimelineProject) = withWindow(project, oldStartTime, oldDuration)

    private fun withWindow(project: TimelineProject, start: Float, duration: Float): TimelineProject = when (kind) {
        TimelineClipKind.VIDEO, TimelineClipKind.IMAGE ->
            project.updateMedia(clipId) { it.copy(startTime = start.toDouble(), duration = duration.toDouble()) }
        TimelineClipKind.AUDIO -> project.updateAudio(clipId) { it.copy(startTime = start, duration = duration) }
        TimelineClipKind.TEXT ->
            project.updateText(clipId) { it.copy(startTime = start.toDouble(), duration = duration.toDouble()) }
        TimelineClipKind.STICKER ->
            project.updateSticker(clipId) { it.copy(startTime = start.toDouble(), duration = duration.toDouble()) }
        TimelineClipKind.PLACE ->
            project.updatePlace(clipId) { it.copy(startTime = start.toDouble(), duration = duration.toDouble()) }
    }
}

@Serializable
@SerialName("splitClip")
data class SplitClipCommand(
    override val id: String = newId(),
    override val timestamp: Long = now(),
    val clipId: String,
    val kind: TimelineClipKind,
    val splitAtRelativeTime: Float,
    val leftId: String,
    val rightId: String,
) : EditCommand {

    override fun apply(project: TimelineProject): TimelineProject {
        val split = splitAtRelativeTime
        return when (kind) {
            TimelineClipKind.VIDEO, TimelineClipKind.IMAGE -> project.copy(
                mediaObjects = project.mediaObjects.splitting(clipId, { it.id }) { original ->
                    val start = original.startTime ?: 0.0
                    val total = original.duration ?: 0.0
                    val at = split.toDouble()
                    original.copy(id = leftId, duration = at) to
                        original.copy(id = rightId, startTime = start + at, duration = maxOf(0.0, total - at))
                },
            )
            TimelineClipKind.AUDIO -> project.copy(
                audioPlayerObjects = project.audioPlayerObjects.splitting(clipId, { it.id }) { original ->
                    val start = original.startTime ?: 0f
                    val total = original.duration ?: 0f
                    original.copy(id = leftId, duration = split) to
                        original.copy(id = rightId, startTime = start + split, duration = maxOf(0f, total - split))
                },
            )
            TimelineClipKind.TEXT -> project.copy(
                textObjects = project.textObjects.splitting(clipId, { it.id }) { original ->
                    val start = (original.startTime ?: 0.0).toFloat()
                    val total = (original.duration ?: 0.0).toFloat()
                    original.copy(id = leftId, duration = split.toDouble()) to
                        original.copy(
                            id = rightId,
                            startTime = (start + split).toDouble(),
                            duration = maxOf(0f, total - split).toDouble(),
                        )
                },
            )
            TimelineClipKind.STICKER -> throw EditCommandError.InvalidState("stickers cannot be split on the timeline")
            TimelineClipKind.PLACE -> throw EditCommandError.InvalidState("places cannot be split on the timeline")
        }
    }

    override fun revert(project: TimelineProject): TimelineProject = when (kind) {
        TimelineClipKind.VIDEO, TimelineClipKind.IMAGE -> project.copy(
            mediaObjects = project.mediaObjects.merging(leftId, rightId, { it.id }) { left, right ->
                left.copy(id = clipId, duration = (left.duration ?: 0.0) + (right.duration ?: 0.0))
            },
        )
        TimelineClipKind.AUDIO -> project.copy(
            audioPlayerObjects = project.audioPlayerObjects.merging(leftId, rightId, { it.id }) { left, right ->
                left.copy(id = clipId, duration = (left.duration ?: 0f) + (right.duration ?: 0f))
            },
        )
        TimelineClipKind.TEXT -> project.copy(
            textObjects = project.textObjects.merging(leftId, rightId, { it.id }) { left, right ->
                left.copy(id = clipId, duration = (left.duration ?: 0.0) + (right.duration ?: 0.0))
            },
        )
        TimelineClipKind.STICKER -> throw EditCommandError.InvalidState("stickers cannot be split on the timeline")
        TimelineClipKind.PLACE -> throw EditCommandError.InvalidState("places cannot be split on the timeline")
    }
}

private fun <T> List<T>.splitting(clipId: String, idOf: (T) -> String, halves: (T) -> Pair<T, T>): List<T> {
    val index = indexOfFirst { idOf(it) == clipId }
    if (index < 0) throw EditCommandError.ClipNotFound(clipId)
    val (left, right) = halves(this[index])
    return take(index) + left + right + drop(index + 1)
}

/** La moitié gauche redevient le clip, la droite part — par IDENTITÉ, jamais par plage. */
private fun <T> List<T>.merging(leftId: String, rightId: String, idOf: (T) -> String, merge: (T, T) -> T): List<T> {
    val leftIndex = indexOfFirst { idOf(it) == leftId }
    val rightIndex = indexOfFirst { idOf(it) == rightId }
    if (leftIndex < 0 || rightIndex < 0) throw EditCommandError.ClipNotFound(leftId)
    val restored = merge(this[leftIndex], this[rightIndex])
    return mapIndexed { i, item -> if (i == leftIndex) restored else item }.filterNot { idOf(it) == rightId }
}
