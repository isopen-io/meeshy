package me.meeshy.ui.story.canvas

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.painter.BitmapPainter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import me.meeshy.sdk.model.scene.SceneBackdropChoice
import me.meeshy.ui.component.media.rememberThumbHashPainter
import me.meeshy.ui.theme.hexColor

internal const val SCENE_LETTERBOX_TAG: String = "scene-letterbox"

/** Réduit [source] au grain de la bande ([SceneBackdropChoice.LONG_EDGE] px) : c'est la réduction qui fait le flou. */
internal fun letterboxBitmap(source: Bitmap): Bitmap {
    val (w, h) = SceneBackdropChoice.downsampledSize(source.width, source.height) ?: return source
    return if (w == source.width && h == source.height) source else Bitmap.createScaledBitmap(source, w, h, true)
}

/**
 * Les bandes d'un fond AJUSTÉ (iOS `refreshLetterboxFill`) : une teinte choisie, pleine, ou le flou du média — le bitmap
 * déjà posé ([stamped], exact), sinon le ThumbHash. Aucun `blur()` : l'image de 32 px étirée à la scène, lissée par le
 * rééchantillonnage, EST le flou. À poser SOUS le média, y compris sous la vidéo.
 */
@Composable
internal fun SceneLetterboxFill(choice: SceneBackdropChoice.Choice, stamped: Bitmap?, modifier: Modifier = Modifier) {
    when (choice) {
        SceneBackdropChoice.Choice.Nothing -> Unit
        is SceneBackdropChoice.Choice.Solid -> Box(
            modifier.fillMaxSize().background(hexColor(choice.hex)).testTag(SCENE_LETTERBOX_TAG),
        )
        is SceneBackdropChoice.Choice.Blur -> when (val source = choice.source) {
            SceneBackdropChoice.Source.StampedBitmap -> stamped?.let { bitmap ->
                val painter = remember(bitmap) { BitmapPainter(letterboxBitmap(bitmap).asImageBitmap(), filterQuality = FilterQuality.Low) }
                BlurredFill(painter, modifier)
            }
            is SceneBackdropChoice.Source.ThumbHash -> rememberThumbHashPainter(source.hash)?.let { BlurredFill(it, modifier) }
            SceneBackdropChoice.Source.None -> Unit
        }
    }
}

@Composable
private fun BlurredFill(painter: androidx.compose.ui.graphics.painter.Painter, modifier: Modifier) {
    Image(
        painter = painter,
        contentDescription = null,
        contentScale = ContentScale.Crop,
        modifier = modifier.fillMaxSize().alpha(SceneBackdropChoice.FILL_OPACITY).testTag(SCENE_LETTERBOX_TAG),
    )
}
