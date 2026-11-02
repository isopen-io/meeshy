package me.meeshy.app.onboarding.illustrations

import androidx.compose.animation.core.SpringSpec
import androidx.compose.animation.core.spring
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import me.meeshy.app.onboarding.IllustrationSpring
import me.meeshy.ui.theme.MeeshyGradients
import me.meeshy.ui.theme.MeeshyMotion

/** Le ressort iOS (`response`, `dampingFraction`) en ressort Compose. */
internal fun IllustrationSpring.toSpec(): SpringSpec<Float> =
    spring(dampingRatio = damping, stiffness = MeeshyMotion.stiffnessForResponse(response))

/** Une taille en sp qui suit la police (iOS `@ScaledMetric`), plafonnée comme `min(size, cap)`. */
@Composable
internal fun scaledDp(size: TextUnit, cap: Dp): Dp {
    val scaled = with(LocalDensity.current) { size.toDp() }
    return if (scaled > cap) cap else scaled
}

/** Un pictogramme décoratif peint du dégradé de la marque. */
@Composable
internal fun BrandIcon(imageVector: ImageVector, size: Dp, modifier: Modifier = Modifier) {
    Icon(
        imageVector = imageVector,
        contentDescription = null,
        modifier = modifier
            .size(size)
            .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
            .drawWithContent {
                drawContent()
                drawRect(MeeshyGradients.brand, blendMode = BlendMode.SrcIn)
            },
    )
}

