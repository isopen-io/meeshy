package me.meeshy.ui.component.bubble

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.size
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
                    .width(252.dp)
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
            Column(
                modifier = modifier.width(252.dp),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            ) {
                visible.chunked(2).forEachIndexed { rowIndex, row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
                        row.forEachIndexed { columnIndex, image ->
                            val imageIndex = rowIndex * 2 + columnIndex
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
    }
}

/** One 124dp cell of the multi-image grid; a positive [hiddenCount] overlays the "+N" badge. */
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
            .size(124.dp)
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
            modifier = Modifier.size(124.dp),
        )
        if (hiddenCount > 0) {
            val hiddenLabel = stringResource(R.string.bubble_hidden_images, hiddenCount)
            Box(
                modifier = Modifier
                    .size(124.dp)
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
