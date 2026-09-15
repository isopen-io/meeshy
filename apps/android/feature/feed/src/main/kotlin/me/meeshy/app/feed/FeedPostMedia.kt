package me.meeshy.app.feed

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import me.meeshy.feature.feed.R
import me.meeshy.sdk.model.MosaicLayoutMode
import me.meeshy.ui.component.media.MosaicArrangement
import me.meeshy.ui.component.media.MosaicLayout
import me.meeshy.ui.component.media.rememberThumbHashPainter
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

/**
 * **Les visuels d'une publication, dans l'agencement choisi par son AUTEUR**
 * (#6514). La disposition ne se décide pas ici : [MosaicLayout.arrange] la
 * rend, et ce fichier choisit seulement la vue qui la peint. Un visuel seul
 * garde son rapport réel, le carrousel pagine, les quatre mosaïques posent
 * leurs tuiles.
 *
 * [onImageTap] `null` ⇒ aucune tuile n'est cliquable. Un hôte sans visionneuse
 * n'expose pas un contrôle qui ne ferait rien.
 */
@Composable
internal fun PostImageLayout(
    images: List<FeedPostImage>,
    layout: MosaicLayoutMode,
    onImageTap: ((Int) -> Unit)?,
) {
    when (val arrangement = MosaicLayout.arrange(images.size, layout)) {
        MosaicArrangement.Empty -> Unit
        MosaicArrangement.Single -> SingleFeedImage(image = images.first(), onImageTap = onImageTap)
        is MosaicArrangement.Paged -> FeedMediaCarousel(images = images, onImageTap = onImageTap)
        is MosaicArrangement.Tiled -> FeedMediaMosaic(images = images, arrangement = arrangement, onImageTap = onImageTap)
    }
}

@Composable
private fun SingleFeedImage(image: FeedPostImage, onImageTap: ((Int) -> Unit)?) {
    val openLabel = stringResource(R.string.feed_open_media)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .aspectRatio(feedImageAspectRatio(image))
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(FEED_MEDIA_GROUND)
            .opensMedia(index = 0, label = openLabel, onImageTap = onImageTap),
    ) {
        FeedMediaImage(image = image, preferThumbnail = false)
        // Légende Prisme-résolue du média (#6280) — DISTINCTE du texte du post
        // (FeedPostPresentation.content) et de tout texte alternatif : un scrim
        // discret sous l'image, jamais de bannière ni de popup intrusive.
        image.caption?.takeIf { it.isNotBlank() }?.let { caption ->
            FeedMediaCaption(text = caption, maxLines = 2, modifier = Modifier.align(Alignment.BottomStart))
        }
    }
}

internal val FEED_MEDIA_GROUND: Color = MeeshyPalette.Indigo500.copy(alpha = 0.08f)

@Composable
internal fun FeedMediaImage(image: FeedPostImage, preferThumbnail: Boolean) {
    AsyncImage(
        model = if (preferThumbnail) image.thumbnailUrl ?: image.url else image.url,
        contentDescription = stringResource(R.string.feed_image_description),
        contentScale = ContentScale.Crop,
        placeholder = rememberThumbHashPainter(image.thumbHash),
        modifier = Modifier.fillMaxSize(),
    )
}

@Composable
internal fun FeedMediaCaption(text: String, modifier: Modifier = Modifier, maxLines: Int = Int.MAX_VALUE) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .background(Brush.verticalGradient(colors = listOf(Color.Transparent, Color.Black.copy(alpha = 0.55f))))
            .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
    ) {
        Text(
            text = text,
            color = MeeshyPalette.White,
            fontSize = 13.sp,
            maxLines = maxLines,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/**
 * La légende qu'une tuile peut porter : celle du média, là où la place le
 * permet ([MosaicLayout.tileCarriesCaption]), bornée en mots
 * ([MosaicLayout.captionWordLimit]). `null` ⇒ la tuile n'en affiche aucune.
 */
internal fun FeedPostImage.captionFor(mode: MosaicLayoutMode, index: Int, count: Int, tileWidth: Float): String? {
    val text = caption?.takeIf { it.isNotBlank() } ?: return null
    if (!MosaicLayout.tileCarriesCaption(mode, index, count)) return null
    return MosaicLayout.truncateWords(text, MosaicLayout.captionWordLimit(mode, count, tileWidth))
}

internal fun Modifier.opensMedia(index: Int, label: String, onImageTap: ((Int) -> Unit)?): Modifier =
    if (onImageTap == null) this else clickable(onClickLabel = label) { onImageTap(index) }

internal fun feedImageAspectRatio(image: FeedPostImage): Float {
    val width = image.width ?: return 1.4f
    val height = image.height ?: return 1.4f
    if (width <= 0 || height <= 0) return 1.4f
    return (width.toFloat() / height.toFloat()).coerceIn(0.7f, 1.9f)
}
