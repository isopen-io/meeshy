package me.meeshy.ui.component.chrome

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.ui.theme.MeeshyGradients
import me.meeshy.ui.theme.MeeshyPalette

/**
 * The primary floating action button — a gradient-filled circle with a strong
 * shadow (parity plan §4.1/§4.2). Defaults to the brand gradient and a `+`; pass a
 * conversation [gradient] to tint it per-context.
 *
 * SDK-pure: opaque [gradient], [icon] and [onClick]; no product state.
 */
@Composable
public fun FloatingGradientFab(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    size: Dp = 56.dp,
    gradient: Brush = MeeshyGradients.brand,
    icon: ImageVector = Icons.Filled.Add,
    contentDescription: String? = null,
) {
    Box(
        modifier = modifier
            .size(size)
            .shadow(elevation = 12.dp, shape = CircleShape, clip = false)
            .clip(CircleShape)
            .background(gradient)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            tint = MeeshyPalette.White,
        )
    }
}
