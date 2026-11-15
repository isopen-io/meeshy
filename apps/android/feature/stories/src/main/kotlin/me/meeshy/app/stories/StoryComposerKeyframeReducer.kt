package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryEasing
import me.meeshy.sdk.model.StoryKeyframe
import me.meeshy.sdk.model.composer.timeline.TrackBar
import kotlin.math.abs

/**
 * **Les images clés, posées depuis la frise** (#14271, iso iOS `TimelineViewModel.addKeyframeAtPlayhead` et la légende de
 * l'Inspecteur « fige position, échelle et opacité à cet instant »). Le geste fige la pose de l'objet à la tête de
 * lecture, au temps RELATIF à son départ, comme le fil le lit (`StoryKeyframeResolver`). L'échelle d'une image clé
 * MULTIPLIE celle de l'objet (#14316) : figer la pose, c'est un facteur 1. Le même geste au même instant
 * la retire. Le texte et le média posé s'animent (`ClipInspector.supportsKeyframes`) ; le sticker et le lieu non. Le son
 * n'a que le canal volume, que la frise ne règle pas encore. Une seule réduction, donc un seul pas d'annulation ; la tête
 * hors de la fenêtre de l'objet ne pose rien.
 */
internal object StoryComposerKeyframeReducer {

    /** À moins de ce temps de la tête, une image clé est « celle de la tête » : un toucher la retire au lieu d'en doubler. */
    private const val SNAP_SECONDS = 0.05f

    /** L'échelle figée : un facteur 1, l'objet à sa propre échelle (#14316). */
    private const val HELD_SCALE_FACTOR = 1.0

    fun keyframableIds(state: StoryComposerUiState): Set<String> {
        val slide = state.deck.selectedSlide
        return (slide.elements.map { it.id } + slide.placedMedia.map { it.id }).toSet()
    }

    fun keyframeAtPlayhead(state: StoryComposerUiState, id: String): StoryKeyframe? {
        val local = localTime(state, id) ?: return null
        return framesOf(state, id).firstOrNull { abs(it.time - local) <= SNAP_SECONDS }
    }

    fun toggled(state: StoryComposerUiState, id: String): StoryComposerUiState {
        val local = localTime(state, id) ?: return state
        val held = keyframeAtPlayhead(state, id)
        val change: (List<StoryKeyframe>, Pose) -> List<StoryKeyframe> = { frames, pose ->
            if (held != null) frames.filterNot { it.id == held.id }
            else (frames + pose.frozenAt(local)).sortedBy { it.time }
        }
        val slide = state.deck.selectedSlide
        return when {
            slide.elements.any { it.id == id } -> state.copy(
                deck = state.deck.updateTextElement(id) { it.copy(keyframes = change(it.keyframes, Pose(it.x, it.y))) },
            )
            slide.placedMedia.any { it.id == id } -> state.copy(
                deck = state.deck.updatePlacedMedia(slide.id) { all ->
                    all.map { if (it.id == id) it.copy(keyframes = change(it.keyframes, Pose(it.x, it.y))) else it }
                },
            )
            else -> state
        }
    }

    private data class Pose(val x: Float, val y: Float) {
        fun frozenAt(time: Float) = StoryKeyframe(
            time = time,
            x = x.toDouble(),
            y = y.toDouble(),
            scale = HELD_SCALE_FACTOR,
            easing = StoryEasing.LINEAR,
        )
    }

    private fun framesOf(state: StoryComposerUiState, id: String): List<StoryKeyframe> {
        val slide = state.deck.selectedSlide
        return slide.elements.firstOrNull { it.id == id }?.keyframes
            ?: slide.placedMedia.firstOrNull { it.id == id }?.keyframes
            ?: emptyList()
    }

    /** La tête dans le temps de l'objet, ou `null` : objet absent, famille sans images clés, ou tête hors de sa fenêtre. */
    private fun localTime(state: StoryComposerUiState, id: String): Float? {
        if (id !in keyframableIds(state)) return null
        val at = state.playheadSeconds
        val (start, end) = when (val bar = state.sceneTracks.firstOrNull { it.id == id }?.bar) {
            is TrackBar.Timed -> bar.start.toFloat() to bar.end.toFloat()
            else -> 0f to state.selectedSlideDurationSeconds.toFloat()
        }
        return (at - start).takeIf { at in start..end }
    }
}
