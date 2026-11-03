package me.meeshy.ui.story.canvas

import android.graphics.Bitmap
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.core.graphics.drawable.toBitmap
import coil.compose.AsyncImage
import me.meeshy.sdk.model.composer.scene.StoryBackdrop
import me.meeshy.sdk.model.composer.scene.StoryFitMode
import me.meeshy.sdk.model.scene.SceneBackdropChoice
import me.meeshy.sdk.model.scene.SceneBackgroundFit
import me.meeshy.sdk.model.scene.SceneBackgroundIdentity
import me.meeshy.sdk.model.scene.SceneBackgroundKind
import me.meeshy.sdk.model.scene.StoryBackgroundObjectTransform
import me.meeshy.ui.component.media.rememberThumbHashPainter

internal const val SCENE_BACKGROUND_IMAGE_TAG: String = "scene-background-image"

/** Le média d'un fond : [localUrl] (`file://` du composer) prime sur l'adresse distante, il se lit hors ligne. */
public sealed interface SceneBackgroundMedia {
    public val url: String
    public val localUrl: String?

    public data class Image(override val url: String, override val localUrl: String? = null) : SceneBackgroundMedia

    public data class Video(
        override val url: String,
        override val localUrl: String? = null,
        public val posterUrl: String? = null,
        public val sourceStartMs: Long? = null,
        public val sourceEndMs: Long? = null,
    ) : SceneBackgroundMedia
}

internal fun SceneBackgroundMedia.resolvedUrl(): String =
    localUrl?.takeIf(SceneBackgroundIdentity::isLocal) ?: url

internal fun SceneBackgroundMedia.kind(): SceneBackgroundKind = when (this) {
    is SceneBackgroundMedia.Image -> SceneBackgroundKind.Image(resolvedUrl())
    is SceneBackgroundMedia.Video -> SceneBackgroundKind.Video(resolvedUrl())
}

/** Le fond uni ou dégradé d'une scène sans média de fond. */
@Composable
public fun SceneBackgroundLayer(brush: Brush, modifier: Modifier = Modifier) {
    Box(modifier.fillMaxSize().background(brush))
}

/**
 * La couche de fond complète (iOS `StoryBackgroundLayer`) : le [brush] en sol, puis les bandes d'un fond AJUSTÉ
 * ([SceneLetterboxFill], SOUS le média), puis le média — image (ThumbHash flouté tant que le bitmap décode) ou vidéo
 * (en boucle, son affiche avant la première image). [transform] (zoom, décalage, rotation) s'applique par-dessus le
 * remplissage de base, découpé au cadre ; les bandes, elles, restent collées au cadre. Une couche de même identité
 * ([SceneBackgroundIdentity]) n'est pas reconstruite.
 */
@Composable
public fun SceneBackgroundLayer(
    media: SceneBackgroundMedia?,
    brush: Brush,
    modifier: Modifier = Modifier,
    fit: SceneBackgroundFit = SceneBackgroundFit.FILL,
    transform: StoryBackgroundObjectTransform = StoryBackgroundObjectTransform.IDENTITY,
    backdrop: StoryBackdrop = StoryBackdrop.BLUR,
    thumbHashes: List<String> = emptyList(),
    letterboxSuppressed: Boolean = false,
    playing: Boolean = true,
    muted: Boolean = false,
    volume: Float = 1f,
    onImageResolved: (String) -> Unit = {},
) {
    Box(modifier.fillMaxSize().clipToBounds()) {
        Box(Modifier.fillMaxSize().background(brush))
        if (media == null) return@Box
        val identity = SceneBackgroundIdentity.of(media.kind())
        key(identity) {
            var stamped by remember { mutableStateOf<Bitmap?>(null) }
            val fitMode = if (fit == SceneBackgroundFit.FIT) StoryFitMode.FIT else StoryFitMode.FILL
            SceneLetterboxFill(
                choice = SceneBackdropChoice.choose(fitMode, backdrop, stamped != null, thumbHashes, letterboxSuppressed),
                stamped = stamped,
            )
            val framed = Modifier.fillMaxSize().graphicsLayer {
                scaleX = transform.scaleX
                scaleY = transform.scaleY
                translationX = transform.offsetXFraction * size.width
                translationY = transform.offsetYFraction * size.height
                rotationZ = transform.rotationDegrees
            }
            val url = media.resolvedUrl()
            when (media) {
                is SceneBackgroundMedia.Image -> AsyncImage(
                    model = url,
                    contentDescription = null,
                    contentScale = if (fit == SceneBackgroundFit.FIT) ContentScale.Fit else ContentScale.Crop,
                    placeholder = rememberThumbHashPainter(thumbHashes.firstOrNull { it.isNotEmpty() }),
                    onSuccess = { state ->
                        if (fit == SceneBackgroundFit.FIT) stamped = state.result.drawable.reducedBitmap()
                        onImageResolved(url)
                    },
                    onError = { onImageResolved(url) },
                    modifier = framed.testTag(SCENE_BACKGROUND_IMAGE_TAG),
                )
                is SceneBackgroundMedia.Video -> SceneBackgroundVideoSurface(
                    url = url,
                    fit = fit,
                    posterUrl = media.posterUrl,
                    thumbHash = thumbHashes.firstOrNull { it.isNotEmpty() },
                    playing = playing,
                    muted = muted,
                    volume = volume,
                    sourceStartMs = media.sourceStartMs,
                    sourceEndMs = media.sourceEndMs,
                    modifier = framed,
                )
            }
        }
    }
}

private fun android.graphics.drawable.Drawable.reducedBitmap(): Bitmap? {
    val (w, h) = SceneBackdropChoice.downsampledSize(intrinsicWidth, intrinsicHeight) ?: return null
    return toBitmap(w, h)
}
