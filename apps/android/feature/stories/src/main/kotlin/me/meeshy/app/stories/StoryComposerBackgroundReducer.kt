package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryBackgroundValue
import me.meeshy.sdk.model.StoryFilter
import me.meeshy.sdk.model.composer.scene.SceneEffectChoice
import me.meeshy.sdk.model.composer.scene.StoryBackdrop


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

    fun fitModeSet(state: StoryComposerUiState, mode: String): StoryComposerUiState =
        state.withDeckTransform { deck -> deck.updateSelectedFrame { it.withFitMode(mode) } }

    fun backdropChosen(state: StoryComposerUiState, backdrop: StoryBackdrop): StoryComposerUiState =
        state.withDeckTransform { deck -> deck.updateSelectedFrame { it.withBackdrop(backdrop) } }

    /** Ouverture et fermeture s'écrivent sur la slide ; l'effet visuel est le filtre, qui a déjà son réducteur. */
    fun effectChosen(state: StoryComposerUiState, choice: SceneEffectChoice): StoryComposerUiState =
        state.withDeckTransform { deck -> deck.updateSelectedFrame { it.applying(choice) } }
}
