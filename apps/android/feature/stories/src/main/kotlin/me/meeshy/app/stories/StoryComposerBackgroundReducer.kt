package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryBackgroundValue
import me.meeshy.sdk.model.StoryFilter
import me.meeshy.sdk.model.composer.scene.SceneEffectChoice
import me.meeshy.sdk.model.composer.scene.StoryBackdrop
import me.meeshy.sdk.model.media.MediaTrimBounds
import me.meeshy.sdk.model.media.MediaTrimRule


/**
 * Pure state-to-state reducers behind the selected slide's look — filter, duration,
 * backdrop colour and designated background media (see [StoryComposerTextReducer]).
 */
internal object StoryComposerBackgroundReducer {

    fun filterSelected(state: StoryComposerUiState, filter: StoryFilter?): StoryComposerUiState =
        state.withDeckTransform { it.setSelectedFilter(filter) }

    fun filterIntensityChanged(state: StoryComposerUiState, intensity: Float): StoryComposerUiState =
        state.withDeckTransform { it.setSelectedFilterIntensity(intensity) }

    fun durationChanged(state: StoryComposerUiState, seconds: Double): StoryComposerUiState =
        state.withDeckTransform { it.setSelectedDuration(seconds) }

    fun backgroundChanged(state: StoryComposerUiState, background: StoryBackgroundValue?): StoryComposerUiState =
        state.withDeckTransform { it.setSelectedBackground(background) }

    /** [objectId] : l'objet posé qui devient le fond (#13905) — lui seul quitte la scène, ses copies y restent. */
    fun backgroundMediaToggled(state: StoryComposerUiState, mediaId: String, objectId: String? = null): StoryComposerUiState =
        state.withDeckTransform { it.toggleSelectedBackgroundMedia(mediaId, objectId) }

    fun backgroundLoopSet(state: StoryComposerUiState, loop: Boolean): StoryComposerUiState =
        state.withDeckTransform { it.setSelectedBackgroundLoop(loop) }

    /** La Boucle du fond peint (#13973) : le fond que le plateau peint sans désignation se désigne d'abord, sinon la boucle n'aurait pas d'objet. */
    fun paintedBackgroundLoopSet(state: StoryComposerUiState, loop: Boolean): StoryComposerUiState {
        val id = state.selectedSlideBackdropMediaId ?: return state
        return state.withDeckTransform { deck ->
            val designated = if (deck.selectedSlideBackgroundMediaId == id) deck else deck.toggleSelectedBackgroundMedia(id)
            designated.setSelectedBackgroundLoop(loop)
        }
    }

    /** La fenêtre gardée de la vidéo de fond (#13973) : bornée à sa source, la source entière s'écrit « pas de coupe ». */
    fun trimmed(state: StoryComposerUiState, bounds: MediaTrimBounds): StoryComposerUiState {
        val id = state.selectedSlideBackdropMediaId ?: return state
        val source = state.backgroundTrimSourceOf(id) ?: return state
        val kept = MediaTrimRule.resolved(bounds.start, bounds.end, source).persisted(source)
        val deck = state.deck.setSelectedBackgroundTrim(id, kept)
        return if (deck === state.deck) state else state.withDeckTransform { deck }
    }

    fun fitModeSet(state: StoryComposerUiState, mode: String): StoryComposerUiState =
        state.withDeckTransform { deck -> deck.updateSelectedFrame { it.withFitMode(mode) } }

    fun backdropChosen(state: StoryComposerUiState, backdrop: StoryBackdrop): StoryComposerUiState =
        state.withDeckTransform { deck -> deck.updateSelectedFrame { it.withBackdrop(backdrop) } }

    /** Ouverture et fermeture s'écrivent sur la slide ; l'effet visuel est le filtre, qui a déjà son réducteur. */
    fun effectChosen(state: StoryComposerUiState, choice: SceneEffectChoice): StoryComposerUiState =
        state.withDeckTransform { deck -> deck.updateSelectedFrame { it.applying(choice) } }
}
