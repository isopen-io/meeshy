package me.meeshy.app.stories

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.AnimationVector1D
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import me.meeshy.sdk.model.StoryAudioMuteState

/**
 * Propriétaire : lot story-viewer-decomposition-and-nav-graph. Les couches de la scène elle-même : fond, objets
 * posés, textes, stickers, dessin, sons. Un lot qui ajoute une couche à la scène la monte ICI, jamais dans l'hôte.
 */
@Composable
internal fun StoryViewerCanvas(
    slide: StorySlideView,
    progress: Animatable<Float, AnimationVector1D>,
    slideDurationMs: Int,
    playing: Boolean,
    muted: Boolean,
    lap: Int,
    viewModel: StoryViewerViewModel,
) {
    var trackMute by remember(slide.id) { mutableStateOf(StoryAudioMuteState()) }
    StorySceneBackground(
        slide = slide,
        playing = playing,
        muted = muted,
        // Un vocal ou un appel prend le son : l'horloge se fige, et repart au retour du focus (sinon : pause utilisateur).
        onAudioFocusLost = viewModel.interruption::onFocusLost,
        onAudioFocusGained = viewModel.interruption::onFocusGained,
        onAudioFocusLostForGood = viewModel.interruption::onFocusLostForGood,
        onImageResolved = viewModel::onImageResolved,
        onBackgroundPlayer = viewModel.mediaSignal::onBackgroundPlayer,
    )
    StorySceneOverlays(
        slide = slide,
        progress = progress,
        slideDurationMs = slideDurationMs,
        playing = playing,
        muted = muted,
        onAudioFocusLost = viewModel.interruption::onFocusLost,
        onAudioFocusGained = viewModel.interruption::onFocusGained,
        onAudioFocusLostForGood = viewModel.interruption::onFocusLostForGood,
        mutedTracks = trackMute.mutedTrackIds,
        onToggleTrack = { id -> trackMute = trackMute.toggleTrack(id) },
    )
    StorySceneAudio(
        slide = slide,
        playing = playing,
        muted = muted,
        elapsedSeconds = { progress.value * slideDurationMs / 1000.0 },
        lap = lap,
        mutedTracks = trackMute.mutedTrackIds,
        onAudioFocusLost = viewModel.interruption::onFocusLost,
        onAudioFocusGained = viewModel.interruption::onFocusGained,
        onAudioFocusLostForGood = viewModel.interruption::onFocusLostForGood,
    )
}
