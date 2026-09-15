package me.meeshy.app.feed

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import me.meeshy.feature.feed.R
import me.meeshy.ui.component.media.MediaCollage
import me.meeshy.ui.component.media.rememberThumbHashPainter
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

private val COLLAGE_HEIGHT = 260.dp

@Composable
internal fun PostImageGrid(images: List<FeedPostImage>, onImageTap: (Int) -> Unit) {
    val shape = RoundedCornerShape(MeeshyRadius.md)
    val openLabel = stringResource(R.string.feed_open_media)
    val layout = MediaCollage.solve(images.size)
    if (layout.isEmpty) return
    if (layout.isSingle) {
        val image = images.first()
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(imageAspectRatio(image))
                .clip(shape)
                .background(MeeshyPalette.Indigo500.copy(alpha = 0.08f))
                .clickable(onClickLabel = openLabel) { onImageTap(0) },
        ) {
            AsyncImage(
                model = image.url,
                contentDescription = stringResource(R.string.feed_image_description),
                contentScale = ContentScale.Crop,
                placeholder = rememberThumbHashPainter(image.thumbHash),
                modifier = Modifier.fillMaxSize(),
            )
            // Légende Prisme-résolue du média (#6280) — DISTINCTE du texte du post
            // (FeedPostPresentation.content) et de tout texte alternatif : un scrim
            // discret sous l'image, jamais de bannière ni de popup intrusive.
            val caption = image.caption?.takeIf { it.isNotBlank() }
            if (caption != null) {
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .fillMaxWidth()
                        .background(
                            Brush.verticalGradient(
                                colors = listOf(Color.Transparent, Color.Black.copy(alpha = 0.55f)),
                            ),
                        )
                        .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
                ) {
                    Text(
                        text = caption,
                        color = MeeshyPalette.White,
                        fontSize = 13.sp,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
        return
    }
    Column(
        modifier = Modifier.height(COLLAGE_HEIGHT),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        layout.rows.forEach { row ->
            Row(
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(row.heightWeight),
            ) {
                row.cells.forEach { cell ->
                    CollageTile(
                        image = images[cell.index],
                        overflowCount = cell.overflowCount,
                        shape = shape,
                        onClick = { onImageTap(cell.index) },
                        onClickLabel = openLabel,
                        modifier = Modifier
                            .weight(cell.widthWeight)
                            .fillMaxHeight(),
                    )
                }
            }
        }
    }
}

@Composable
private fun CollageTile(
    image: FeedPostImage,
    overflowCount: Int,
    shape: Shape,
    onClick: () -> Unit,
    onClickLabel: String,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .clip(shape)
            .background(MeeshyPalette.Indigo500.copy(alpha = 0.08f))
            .clickable(onClickLabel = onClickLabel, onClick = onClick),
    ) {
        AsyncImage(
            model = image.thumbnailUrl ?: image.url,
            contentDescription = stringResource(R.string.feed_image_description),
            contentScale = ContentScale.Crop,
            placeholder = rememberThumbHashPainter(image.thumbHash),
            modifier = Modifier.fillMaxSize(),
        )
        if (overflowCount > 0) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.45f)),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = stringResource(R.string.feed_hidden_images, overflowCount),
                    color = MeeshyPalette.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = 20.sp,
                )
            }
        }
    }
}

private fun imageAspectRatio(image: FeedPostImage): Float {
    val width = image.width ?: return 1.4f
    val height = image.height ?: return 1.4f
    if (width <= 0 || height <= 0) return 1.4f
    return (width.toFloat() / height.toFloat()).coerceIn(0.7f, 1.9f)
}
