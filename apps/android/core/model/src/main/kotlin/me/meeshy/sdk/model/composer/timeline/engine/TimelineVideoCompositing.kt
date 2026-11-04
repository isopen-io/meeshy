package me.meeshy.sdk.model.composer.timeline.engine

import me.meeshy.sdk.model.StoryClipTransition
import me.meeshy.sdk.model.StoryMediaKind
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StoryTransitionKind

/** Une rampe d'opacité de [fromOpacity] à [toOpacity] sur [startSeconds]..+[durationSeconds]. */
data class OpacityRamp(val fromOpacity: Float, val toOpacity: Float, val startSeconds: Double, val durationSeconds: Double) {
    val endSeconds: Double get() = startSeconds + durationSeconds
}

/** Ce qu'une couche vidéo reçoit : ses rampes (fondus d'entrée/sortie, fondu enchaîné) et le besoin d'un dissolve. */
data class LayerInstructionConfig(val opacityRamps: List<OpacityRamp>, val usesDissolveFilter: Boolean) {

    /** L'opacité à [seconds] : l'état de la dernière rampe commencée, tenu après sa fin ; avant tout, l'origine de la première. */
    fun opacityAt(seconds: Double): Float {
        val ordered = opacityRamps.sortedBy { it.startSeconds }
        val first = ordered.firstOrNull() ?: return 1f
        if (seconds < first.startSeconds) return first.fromOpacity
        val ramp = ordered.last { it.startSeconds <= seconds }
        if (ramp.durationSeconds <= 0.0 || seconds >= ramp.endSeconds) return ramp.toOpacity
        val progress = ((seconds - ramp.startSeconds) / ramp.durationSeconds).toFloat()
        return ramp.fromOpacity + (ramp.toOpacity - ramp.fromOpacity) * progress
    }
}

/** Un intervalle contigu de la composition et les clips vidéo qui le couvrent entièrement. */
data class CompositionSegment(val startSeconds: Double, val endSeconds: Double, val activeClipIds: List<String>)

/** Le compositeur vidéo de l'aperçu (miroir de `VideoCompositor`) : segments, fondus enchaînés (crossfade) et dissolve. */
object TimelineVideoCompositing {

    private const val EDGE = 0.0001

    /** Les clips vidéo de premier plan, dans l'ordre : le fond n'est pas composé. */
    fun foregroundVideoClips(media: List<StoryMediaObject>): List<StoryMediaObject> =
        media.filter { it.kind == StoryMediaKind.VIDEO && !it.isBackground }

    fun segments(clips: List<StoryMediaObject>, slideDuration: Float): List<CompositionSegment> {
        val total = slideDuration.toDouble()
        val boundaries = sortedSetOf(0.0, total)
        clips.forEach { clip ->
            val start = clip.startTime ?: 0.0
            val duration = clip.duration ?: total
            boundaries += maxOf(0.0, start)
            boundaries += minOf(total, start + duration)
        }
        return boundaries.toList().zipWithNext().filter { (from, to) -> to > from }.map { (from, to) ->
            val active = clips.filter { clip ->
                val start = clip.startTime ?: 0.0
                val end = start + (clip.duration ?: total)
                start <= from + EDGE && end >= to - EDGE
            }
            CompositionSegment(from, to, active.map { it.id })
        }
    }

    fun layerConfig(
        startSeconds: Double,
        endSeconds: Double,
        fadeIn: Float,
        fadeOut: Float,
        outgoing: StoryClipTransition?,
        incoming: StoryClipTransition?,
    ): LayerInstructionConfig {
        val ramps = mutableListOf<OpacityRamp>()
        var dissolve = false
        if (fadeIn > 0) ramps += OpacityRamp(0f, 1f, startSeconds, fadeIn.toDouble())
        if (fadeOut > 0) ramps += OpacityRamp(1f, 0f, endSeconds - fadeOut, fadeOut.toDouble())
        outgoing?.let {
            when (it.kind) {
                StoryTransitionKind.CROSSFADE -> ramps += OpacityRamp(1f, 0f, endSeconds - it.duration, it.duration.toDouble())
                StoryTransitionKind.DISSOLVE -> dissolve = true
            }
        }
        incoming?.let {
            when (it.kind) {
                StoryTransitionKind.CROSSFADE -> ramps += OpacityRamp(0f, 1f, startSeconds, it.duration.toDouble())
                StoryTransitionKind.DISSOLVE -> dissolve = true
            }
        }
        return LayerInstructionConfig(ramps, dissolve)
    }

    /** La couche de chaque clip actif d'un segment, avec la transition qui part de lui et celle qui arrive sur lui. */
    fun segmentLayers(
        segment: CompositionSegment,
        clips: List<StoryMediaObject>,
        transitions: List<StoryClipTransition>,
        slideDuration: Float,
    ): Map<String, LayerInstructionConfig> {
        val byId = clips.associateBy { it.id }
        return segment.activeClipIds.mapNotNull { id ->
            val clip = byId[id] ?: return@mapNotNull null
            val start = maxOf(0.0, clip.startTime ?: 0.0)
            val end = start + (clip.duration ?: slideDuration.toDouble())
            id to layerConfig(
                startSeconds = start,
                endSeconds = end,
                fadeIn = (clip.fadeIn ?: 0.0).toFloat(),
                fadeOut = (clip.fadeOut ?: 0.0).toFloat(),
                outgoing = transitions.firstOrNull { it.fromClipId == id },
                incoming = transitions.firstOrNull { it.toClipId == id },
            )
        }.toMap()
    }

    /** `true` quand au moins une transition demande le filtre dissolve (compositeur dédié côté lecteur). */
    fun needsDissolveCompositor(transitions: List<StoryClipTransition>): Boolean =
        transitions.any { it.kind == StoryTransitionKind.DISSOLVE }
}
