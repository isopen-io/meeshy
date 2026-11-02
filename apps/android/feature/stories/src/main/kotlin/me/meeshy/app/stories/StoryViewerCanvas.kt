package me.meeshy.app.stories

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.AnimationVector1D
import androidx.compose.runtime.Composable

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
    viewModel: StoryViewerViewModel,
) {
    StorySceneBackground(
        slide = slide,
        playing = playing,
        muted = muted,
        // Un vocal ou un appel prend le son : la story se fige avec la vidéo (minuterie comprise), comme un appui long.
        onAudioFocusLost = viewModel::pauseByHold,
        onImageResolved = viewModel::onImageResolved,
    )
    StorySceneOverlays(
        slide = slide,
        progress = progress,
        slideDurationMs = slideDurationMs,
        playing = playing,
        muted = muted,
        onAudioFocusLost = viewModel::pauseByHold,
    )
    StorySceneAudio(slide = slide, playing = playing, muted = muted)
}
