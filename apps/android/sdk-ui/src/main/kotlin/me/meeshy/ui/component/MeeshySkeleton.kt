package me.meeshy.ui.component

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Shape
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshyTheme

/**
 * A neutral placeholder block for cache-cold skeleton screens (Instant App
 * Principles — a skeleton shows only on an empty cache). Tinted with the
 * theme's tertiary surface so it adapts to light/dark.
 */
@Composable
public fun MeeshySkeletonBox(
    modifier: Modifier = Modifier,
    shape: Shape = RoundedCornerShape(MeeshyRadius.sm),
) {
    Box(modifier = modifier.clip(shape).background(MeeshyTheme.tokens.backgroundTertiary))
}
