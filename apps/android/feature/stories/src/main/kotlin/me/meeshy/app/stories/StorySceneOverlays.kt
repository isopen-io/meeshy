package me.meeshy.app.stories

import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier

/**
 * Les objets posés sur le fond de la slide (médias, textes, stickers, pastilles sonores, trait
 * dessiné), seuls à lire la tête de lecture. Isolés dans leur propre portée de recomposition :
 * l'horloge de 60 images par seconde ne fait plus recomposer l'écran du lecteur (en-tête, rail,
 * feuilles) — et une slide statique ([needsPlayhead] faux) ne lit pas l'horloge du tout.
 */
@Composable
internal fun StorySceneOverlays(
    slide: StorySlideView,
    progress: Animatable<Float, androidx.compose.animation.core.AnimationVector1D>,
    slideDurationMs: Int,
    playing: Boolean,
    muted: Boolean,
    rewindWhenInactive: Boolean = false,
    onAudioFocusLost: () -> Unit = {},
    onAudioFocusGained: () -> Unit = {},
    onAudioFocusLostForGood: () -> Unit = {},
    players: Boolean = true,
    mutedTracks: Set<String> = emptySet(),
    onToggleTrack: ((String) -> Unit)? = null,
) {
    val playheadSeconds = if (slide.needsPlayhead) progress.value * slideDurationMs / 1000f else 0f
    val focusHolder = StorySceneAudioFocus.holder(slide)
    val chipClock = remember(progress, slideDurationMs) { AudioChipClock.Playhead({ progress.value * slideDurationMs / 1000.0 }) }

    StorySceneLayerOrder.order(slide).forEach { layer ->
        key(layer.key) {
            when (layer) {
                is StorySceneLayer.Media -> if (layer.view.isVisible(playheadSeconds)) {
                    StoryForegroundLayer(
                        media = layer.view,
                        playheadSeconds = playheadSeconds,
                        playing = playing,
                        muted = muted,
                        rewindWhenInactive = rewindWhenInactive,
                        onAudioFocusLost = onAudioFocusLost,
                        onAudioFocusGained = onAudioFocusGained,
                        onAudioFocusLostForGood = onAudioFocusLostForGood,
                        players = players,
                        holdsAudioFocus = focusHolder == StorySceneAudioFocus.Holder.Placed(layer.view.id),
                        looks = slide.composerLooks,
                    )
                }
                is StorySceneLayer.Text -> if (layer.view.isVisible(playheadSeconds)) {
                    StoryTextObjectLayer(textObject = layer.view, playheadSeconds = playheadSeconds)
                }
                is StorySceneLayer.Sticker -> if (layer.view.isVisible(playheadSeconds)) {
                    StoryStickerLayer(sticker = layer.view, playheadSeconds = playheadSeconds)
                }
                is StorySceneLayer.Place -> if (layer.view.isVisible(playheadSeconds)) {
                    StoryPlaceObjectLayer(place = layer.view)
                }
                is StorySceneLayer.Audio -> if (layer.view.isVisible(playheadSeconds)) {
                    StoryAudioChipLayer(
                        chip = layer.view,
                        muted = layer.view.id in mutedTracks,
                        clock = chipClock,
                        chipModifier = Modifier.storyAudioChipTap(
                            muted = layer.view.id in mutedTracks,
                            onToggle = onToggleTrack?.let { toggle -> { toggle(layer.view.id) } },
                        ),
                    )
                }
            }
        }
    }
    // Le trait de l'auteur, en lecture seule : une slide faite du seul dessin est publiable.
    if (slide.strokes.isNotEmpty()) {
        StoryDrawingLayer(
            strokes = slide.strokes,
            isCapturing = false,
            activeColorHex = "#FFFFFF",
            activeWidthDesign = 0.0,
            onStrokeCaptured = {},
            modifier = Modifier.fillMaxSize(),
        )
    }
}
