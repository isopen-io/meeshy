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
) {
    val playheadSeconds = if (slide.needsPlayhead) progress.value * slideDurationMs / 1000f else 0f

    slide.foregroundMedia.forEach { foreground ->
        if (foreground.isVisible(playheadSeconds)) {
            key(foreground.id) {
                StoryForegroundLayer(
                    media = foreground,
                    playheadSeconds = playheadSeconds,
                    playing = playing,
                    muted = muted,
                    rewindWhenInactive = rewindWhenInactive,
                    onAudioFocusLost = onAudioFocusLost,
                )
            }
        }
    }
    slide.textObjects.forEach { textObject ->
        if (textObject.isVisible(playheadSeconds)) {
            key(textObject.id) {
                StoryTextObjectLayer(textObject = textObject, playheadSeconds = playheadSeconds)
            }
        }
    }
    slide.stickers.forEach { sticker ->
        if (sticker.isVisible(playheadSeconds)) {
            key(sticker.id) { StoryStickerLayer(sticker = sticker, playheadSeconds = playheadSeconds) }
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
