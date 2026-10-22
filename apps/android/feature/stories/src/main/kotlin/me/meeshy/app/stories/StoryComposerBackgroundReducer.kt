package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryBackgroundValue
import me.meeshy.sdk.model.StoryFilter


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

    fun backgroundMediaToggled(state: StoryComposerUiState, mediaId: String): StoryComposerUiState =
        state.withDeckTransform { it.toggleSelectedBackgroundMedia(mediaId) }

    fun backgroundLoopSet(state: StoryComposerUiState, loop: Boolean): StoryComposerUiState =
        state.withDeckTransform { it.setSelectedBackgroundLoop(loop) }
}
