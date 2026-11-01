package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryBackgroundValue
import me.meeshy.sdk.model.StoryFilter
import me.meeshy.sdk.model.StoryMediaRotation
import me.meeshy.sdk.model.composer.scene.SceneEffectChoice
import me.meeshy.sdk.model.composer.scene.StoryBackdrop
import me.meeshy.sdk.model.media.MediaTrimBounds
import me.meeshy.sdk.model.media.MediaTrimRule
import me.meeshy.sdk.model.scene.StoryVolumeCarryingLaw
import me.meeshy.sdk.model.scene.StoryVolumeState


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

    /** Pivoter (#14083) : le fond tourne d'un quart, comme un média posé ; quatre touchers le rendent droit. */
    fun rotated(state: StoryComposerUiState): StoryComposerUiState =
        backgroundSetting(state) { it.copy(rotationDeg = StoryMediaRotation.turned(it.rotationDeg)) }

    /** Le volume d'une vidéo de fond, 0…1 (#14083) ; 0 coupe en mémorisant le niveau quitté. Inerte pour une image. */
    fun volumeSet(state: StoryComposerUiState, volume: Float): StoryComposerUiState =
        backgroundSound(state) { setting ->
            StoryVolumeCarryingLaw.setVolume(StoryVolumeState(setting.volume, setting.mutedVolumeMemento), volume.coerceIn(0f, 1f))
                .let { setting.copy(volume = it.volume, mutedVolumeMemento = it.mutedVolumeMemento) }
        }

    /** Muet : coupe la vidéo de fond, ou lui rend le niveau qu'elle avait (#14083). Inerte pour une image. */
    fun muteToggled(state: StoryComposerUiState): StoryComposerUiState =
        backgroundSound(state) { setting ->
            StoryVolumeCarryingLaw.toggleMute(StoryVolumeState(setting.volume, setting.mutedVolumeMemento))
                .let { setting.copy(volume = it.volume, mutedVolumeMemento = it.mutedVolumeMemento) }
        }

    private fun backgroundSound(state: StoryComposerUiState, change: (StoryBackgroundSetting) -> StoryBackgroundSetting): StoryComposerUiState {
        val id = state.selectedSlideBackdropMediaId ?: return state
        return if (state.placedMediaIsVideo(id)) backgroundSetting(state, change) else state
    }

    private fun backgroundSetting(state: StoryComposerUiState, change: (StoryBackgroundSetting) -> StoryBackgroundSetting): StoryComposerUiState {
        val id = state.selectedSlideBackdropMediaId ?: return state
        val deck = state.deck.updateSelectedBackgroundSetting(id, change)
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
