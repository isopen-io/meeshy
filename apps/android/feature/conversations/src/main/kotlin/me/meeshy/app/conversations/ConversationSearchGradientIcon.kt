package me.meeshy.app.conversations

import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector

/** Icône teintée par un dégradé (iOS `foregroundStyle(LinearGradient)`) ; sans [brush], teinte [mutedTint]. */
@Composable
internal fun GradientIcon(
    imageVector: ImageVector,
    mutedTint: Color,
    modifier: Modifier = Modifier,
    brush: Brush? = null,
    contentDescription: String? = null,
) {
    val painted = if (brush == null) {
        modifier
    } else {
        modifier
            .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
            .drawWithContent {
                drawContent()
                drawRect(brush = brush, blendMode = BlendMode.SrcIn)
            }
    }
    Icon(
        imageVector = imageVector,
        contentDescription = contentDescription,
        tint = if (brush == null) mutedTint else Color.White,
        modifier = painted,
    )
}
