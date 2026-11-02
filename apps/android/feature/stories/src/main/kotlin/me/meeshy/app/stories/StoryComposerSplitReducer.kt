package me.meeshy.app.stories

import me.meeshy.sdk.model.composer.ComposerObjectKind
import me.meeshy.sdk.model.composer.timeline.ClipWindowResolver
import me.meeshy.sdk.model.composer.timeline.FriseBarDrag
import me.meeshy.sdk.model.composer.timeline.TrackBar
import me.meeshy.sdk.model.media.MediaTrimBounds
import me.meeshy.sdk.model.media.MediaTrimRule

/**
 * **« Couper » à la tête, pour toutes les familles qui se coupent** (#14221, #14224, iso iOS `splitSelectedAtPlayhead` +
 * `SplitClipCommand`) : un texte, une VIDÉO posée ou un SON devient deux objets qui se suivent, au même endroit. Une vidéo
 * et un son coupés REPRENNENT LEUR SOURCE au point de coupe : la seconde moitié joue la suite, jamais le début du fichier.
 * Une seule réduction, donc un seul pas d'annulation ; la tête hors de la fenêtre, ou une coupe trop près d'un bord de la
 * source, ne coupe rien.
 */
internal object StoryComposerSplitReducer {

    fun split(state: StoryComposerUiState, id: String, newId: String): StoryComposerUiState =
        when (StorySceneStack.order(state.deck.selectedSlide).firstOrNull { it.id == id }?.kind) {
            ComposerObjectKind.TEXT -> StoryComposerSceneReducer.textSplit(state, id, newId)
            ComposerObjectKind.MEDIA -> video(state, id, newId)
            ComposerObjectKind.AUDIO -> sound(state, id, newId)
            else -> state
        }

    /** Les objets de la diapo que la frise offre à la coupe : les textes, les vidéos de durée connue, les sons posés. */
    fun splittableIds(state: StoryComposerUiState): Set<String> {
        val slide = state.deck.selectedSlide
        return (slide.elements.map { it.id } +
            slide.placedMedia.map { it.id }.filter { state.placedTrimSourceOf(it) != null } +
            slide.audio.filter { it.isBackground != true }.map { it.id }).toSet()
    }

    private fun video(state: StoryComposerUiState, id: String, newId: String): StoryComposerUiState {
        val slide = state.deck.selectedSlide
        val source = slide.placedMedia.firstOrNull { it.id == id } ?: return state
        val trim = state.placedTrimOf(id) ?: return state
        if (slide.holdsMediaObject(newId)) return state
        val window = windowOf(state, id)
        val at = state.playheadSeconds
        if (!FriseBarDrag.canSplit(window, at)) return state
        val cut = trim.start + (at - window.start)
        if (cut - trim.start < MediaTrimRule.MINIMUM_DURATION || trim.end - cut < MediaTrimRule.MINIMUM_DURATION) return state
        val copy = source.copy(id = newId, zIndex = StorySceneStack.nextZ(slide))
        val duplicated = state.copy(deck = state.deck.updatePlacedMedia(slide.id) { it + copy.normalised() })
        val halves = halves(duplicated, id, newId, window, at)
        val left = StoryComposerPlacedMediaReducer.trimmed(halves, id, MediaTrimBounds(trim.start, cut))
        return StoryComposerPlacedMediaReducer.trimmed(left, newId, MediaTrimBounds(cut, trim.end))
    }

    private fun sound(state: StoryComposerUiState, id: String, newId: String): StoryComposerUiState {
        val slide = state.deck.selectedSlide
        val source = slide.audio.firstOrNull { it.id == id && it.isBackground != true } ?: return state
        if (slide.audio.any { it.id == newId }) return state
        val window = windowOf(state, id)
        val at = state.playheadSeconds
        if (!FriseBarDrag.canSplit(window, at)) return state
        val cut = (source.sourceStart ?: 0f) + (at - window.start)
        val left = source.copy(sourceStart = source.sourceStart ?: 0f, sourceEnd = cut)
        val right = source.copy(id = newId, sourceStart = cut, zIndex = StorySceneStack.nextZ(slide))
        val next = slide.copy(
            audio = slide.audio.map { if (it.id == id) left else it } + right,
            soundSources = slide.soundSources[id]?.let { slide.soundSources + (newId to it) } ?: slide.soundSources,
            soundTranscriptions = slide.soundTranscriptions[id]?.let { slide.soundTranscriptions + (newId to it) } ?: slide.soundTranscriptions,
        )
        val duplicated = state.copy(deck = state.deck.copy(slides = state.deck.slides.map { if (it.id == slide.id) next else it }))
        return halves(duplicated, id, newId, window, at)
    }

    private fun windowOf(state: StoryComposerUiState, id: String): ClipWindowResolver.Window =
        when (val bar = state.sceneTracks.firstOrNull { it.id == id }?.bar) {
            is TrackBar.Timed -> ClipWindowResolver.Window(bar.start.toFloat(), (bar.end - bar.start).toFloat())
            else -> ClipWindowResolver.Window(0f, state.selectedSlideDurationSeconds.toFloat())
        }

    private fun halves(state: StoryComposerUiState, id: String, newId: String, window: ClipWindowResolver.Window, at: Float): StoryComposerUiState {
        val slide = state.selectedSlideDurationSeconds.toFloat()
        val left = FriseBarDrag.stored(ClipWindowResolver.Window(window.start, at - window.start), slide)
        val right = FriseBarDrag.stored(ClipWindowResolver.Window(at, window.end - at), slide)
        val first = StoryComposerSceneReducer.windowed(state, id, left.startSeconds, left.durationSeconds)
        return StoryComposerSceneReducer.windowed(first, newId, right.startSeconds, right.durationSeconds)
    }
}
