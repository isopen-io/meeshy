package me.meeshy.app.feed

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.sp
import me.meeshy.feature.feed.R
import me.meeshy.ui.component.media.MosaicArrangement
import me.meeshy.ui.component.media.MosaicTile
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius

/**
 * **Les quatre mosaïques d'une publication** (#6514) : vague, hero, défilement
 * continu, sinusoïde. C'est la moitié rendu de `PostSceneMosaic.swift`, dont la
 * géométrie vit dans `MosaicLayout` (`:sdk-ui`). Le carrousel, cinquième
 * agencement et défaut, est [FeedMediaCarousel].
 *
 * La boîte a la largeur de la carte et le rapport que le mode DÉCLARE. Le
 * défilement déborde volontairement à droite, et c'est son CONTENU qui
 * s'étend puis défile. Rogner ce débordement cacherait les tuiles 3 et 4 au
 * lieu de les offrir.
 */
@Composable
internal fun FeedMediaMosaic(
    images: List<FeedPostImage>,
    arrangement: MosaicArrangement.Tiled,
    onImageTap: ((Int) -> Unit)?,
) {
    val openLabel = stringResource(R.string.feed_open_media)
    val scroll = rememberScrollState()
    BoxWithConstraints(
        modifier = Modifier
            .fillMaxWidth()
            .aspectRatio(1f / arrangement.aspectRatio),
    ) {
        val boxWidth = maxWidth
        val boxHeight = maxHeight
        Box(
            modifier = Modifier
                .fillMaxSize()
                .then(if (arrangement.span > 1f) Modifier.horizontalScroll(scroll) else Modifier),
        ) {
            Box(
                modifier = Modifier
                    .width(boxWidth * arrangement.span)
                    .height(boxHeight),
            ) {
                arrangement.tiles.forEach { tile ->
                    val image = images.getOrNull(tile.index) ?: return@forEach
                    key(image.id) {
                        MosaicTileView(
                            image = image,
                            tile = tile,
                            arrangement = arrangement,
                            count = images.size,
                            boxWidth = boxWidth,
                            boxHeight = boxHeight,
                            openLabel = openLabel,
                            onImageTap = onImageTap,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun MosaicTileView(
    image: FeedPostImage,
    tile: MosaicTile,
    arrangement: MosaicArrangement.Tiled,
    count: Int,
    boxWidth: Dp,
    boxHeight: Dp,
    openLabel: String,
    onImageTap: ((Int) -> Unit)?,
) {
    Box(
        modifier = Modifier
            .offset(x = boxWidth * tile.x, y = boxHeight * tile.y)
            .size(width = boxWidth * tile.width, height = boxHeight * tile.height)
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(FEED_MEDIA_GROUND)
            .opensMedia(index = tile.index, label = openLabel, onImageTap = onImageTap),
    ) {
        FeedMediaImage(image = image, preferThumbnail = true)
        if (tile.overflow > 0) {
            // Le « +N » porte déjà un voile et un chiffre au centre : une légende
            // y ferait une troisième chose au même endroit.
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.45f)),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = stringResource(R.string.feed_hidden_images, tile.overflow),
                    color = MeeshyPalette.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = 22.sp,
                )
            }
        } else {
            image.captionFor(arrangement.mode, tile.index, count, tile.width)?.let { caption ->
                FeedMediaCaption(text = caption, modifier = Modifier.align(Alignment.BottomStart))
            }
        }
    }
}
