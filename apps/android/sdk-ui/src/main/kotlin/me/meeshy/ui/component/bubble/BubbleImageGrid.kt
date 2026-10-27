package me.meeshy.ui.component.bubble

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.unit.Constraints
import kotlin.math.min
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

private const val MAX_GRID_IMAGES = 4
private val GRID_WIDTH = 252.dp

/**
 * The image attachments of a bubble: a single image keeps its own aspect ratio (clamped), two to
 * four images tile in a 2-column grid, and a fifth+ image collapses into a "+N" overlay on the last
 * visible cell. A null [onImageClick] leaves every cell non-interactive.
 */
@Composable
internal fun BubbleImageGrid(
    images: List<BubbleImage>,
    onImageClick: ((Int) -> Unit)?,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(MeeshyRadius.md)
    when {
        images.size == 1 -> {
            val image = images.first()
            val ratio = imageAspectRatio(image)
            AsyncImage(
                model = image.url,
                contentDescription = bubbleImageContentDescription(image, stringResource(R.string.bubble_image_description)),
                contentScale = ContentScale.Crop,
                modifier = modifier
                    .width(GRID_WIDTH)
                    .aspectRatio(ratio)
                    .clip(shape)
                    .background(MeeshyPalette.Indigo500.copy(alpha = 0.08f))
                    .let { base ->
                        if (onImageClick == null) base
                        else base.clickable { onImageClick(0) }.semantics { role = Role.Button }
                    },
            )
        }
        else -> {
            val visible = images.take(MAX_GRID_IMAGES)
            val hiddenCount = images.size - visible.size
            BubbleImageTiles(modifier = modifier) {
                visible.forEachIndexed { imageIndex, image ->
                    BubbleImageCell(
                        image = image,
                        imageIndex = imageIndex,
                        hiddenCount = if (hiddenCount > 0 && imageIndex == visible.lastIndex) hiddenCount else 0,
                        shape = shape,
                        onImageClick = onImageClick,
                    )
                }
            }
        }
    }
}

/**
 * Two square columns, 252 dp wide at most: a bubble narrowed by its row (selection gutter, split
 * screen, a 360 dp phone) shrinks the cells instead of clipping the right column (#13376).
 */
@Composable
private fun BubbleImageTiles(modifier: Modifier, content: @Composable () -> Unit) {
    Layout(content = content, modifier = modifier) { measurables, constraints ->
        val gap = MeeshySpacing.xs.roundToPx()
        val full = GRID_WIDTH.roundToPx()
        val width = if (constraints.hasBoundedWidth) min(full, constraints.maxWidth) else full
        val cell = ((width - gap) / 2).coerceAtLeast(0)
        val placeables = measurables.map { it.measure(Constraints.fixed(cell, cell)) }
        val rows = (placeables.size + 1) / 2
        val height = (rows * cell + (rows - 1).coerceAtLeast(0) * gap)
        layout(width, height) {
            placeables.forEachIndexed { index, placeable ->
                placeable.placeRelative((index % 2) * (cell + gap), (index / 2) * (cell + gap))
            }
        }
    }
}

/** One square cell of the multi-image grid, sized by [BubbleImageTiles]; a positive [hiddenCount] overlays the "+N" badge. */
@Composable
private fun BubbleImageCell(
    image: BubbleImage,
    imageIndex: Int,
    hiddenCount: Int,
    shape: Shape,
    onImageClick: ((Int) -> Unit)?,
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .clip(shape)
            .background(MeeshyPalette.Indigo500.copy(alpha = 0.08f))
            .let { base ->
                if (onImageClick == null) base
                else base.clickable { onImageClick(imageIndex) }
                    .semantics { role = Role.Button }
            },
    ) {
        AsyncImage(
            model = image.thumbnailUrl ?: image.url,
            contentDescription = bubbleImageContentDescription(image, stringResource(R.string.bubble_image_description)),
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize(),
        )
        if (hiddenCount > 0) {
            val hiddenLabel = stringResource(R.string.bubble_hidden_images, hiddenCount)
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.45f))
                    .clearAndSetSemantics { contentDescription = hiddenLabel },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "+$hiddenCount",
                    color = MeeshyPalette.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = 20.sp,
                )
            }
        }
    }
}

/**
 * TalkBack description for a bubble image: the author-authored [BubbleImage.alt]
 * (#6813) when present and non-blank, else the generic localized [fallback] —
 * never a blank announcement.
 */
internal fun bubbleImageContentDescription(image: BubbleImage, fallback: String): String =
    image.alt?.takeIf { it.isNotBlank() } ?: fallback

private fun imageAspectRatio(image: BubbleImage): Float {
    val width = image.width ?: return 1f
    val height = image.height ?: return 1f
    if (width <= 0 || height <= 0) return 1f
    return (width.toFloat() / height.toFloat()).coerceIn(0.6f, 1.8f)
}
