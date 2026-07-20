package me.meeshy.ui.component.chrome

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.dp
import me.meeshy.ui.theme.MeeshyGradients
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshyTheme

/**
 * The "verre" surface — a translucent indigo-tinted fill over the gradient
 * background plus a gradient indigo border (parity plan §4.1).
 *
 * Compose has no native backdrop blur, so the frosted look is achieved with a
 * semi-transparent [MeeshyTheme.tokens] fill (the gradient shows through) rather
 * than a content blur — the plan's documented fallback ("surface opaque sous
 * API 31"), applied uniformly here for a consistent result across API levels.
 */
@Composable
fun MeeshyGlassSurface(
    modifier: Modifier = Modifier,
    shape: Shape = RoundedCornerShape(MeeshyRadius.lg),
    content: @Composable BoxScope.() -> Unit,
) {
    val dark = MeeshyTheme.isDark
    val fill = MeeshyTheme.tokens.backgroundSecondary.copy(alpha = if (dark) 0.60f else 0.72f)
    Box(
        modifier
            .clip(shape)
            .background(fill)
            .border(1.dp, MeeshyGradients.glassBorder(dark), shape),
        content = content,
    )
}
