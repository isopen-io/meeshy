package me.meeshy.app.stories

import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
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
    players: Boolean = true,
) {
    val playheadSeconds = if (slide.needsPlayhead) progress.value * slideDurationMs / 1000f else 0f

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
                        players = players,
                    )
                }
                is StorySceneLayer.Text -> if (layer.view.isVisible(playheadSeconds)) {
                    StoryTextObjectLayer(textObject = layer.view, playheadSeconds = playheadSeconds)
                }
                is StorySceneLayer.Sticker -> if (layer.view.isVisible(playheadSeconds)) {
                    StoryStickerLayer(sticker = layer.view, playheadSeconds = playheadSeconds)
                }
            }
        }
    }
    slide.audioChips.forEach { chip ->
        if (chip.isVisible(playheadSeconds)) {
            key(chip.id) { StoryAudioChipLayer(chip = chip) }
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
