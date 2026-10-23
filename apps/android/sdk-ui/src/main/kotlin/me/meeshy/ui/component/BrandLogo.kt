package me.meeshy.ui.component

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.brand.BrandMarkGeometry
import me.meeshy.ui.component.auth.AnimatedBrandLogo
import me.meeshy.ui.component.auth.rememberAnimationsReduced
import me.meeshy.ui.theme.MeeshyPalette

/**
 * The Meeshy brand mark — the three round-capped strokes of the iOS logo (opacities
 * 0.7 / 1 / 0.75), no longer the rounded square with an "M". Static by default; set
 * [animated] for the stroke-by-stroke reveal (static under "reduce animations").
 */
@Composable
public fun BrandLogo(
    modifier: Modifier = Modifier,
    size: Dp = 72.dp,
    color: Color = MeeshyPalette.Indigo500,
    animated: Boolean = false,
) {
    val reduced = rememberAnimationsReduced()
    Box(modifier = modifier.size(size).semantics { contentDescription = "Meeshy" }) {
        AnimatedBrandLogo(
            modifier = Modifier.size(size),
            color = color,
            lineWidth = size * BrandMarkGeometry.LINE_WIDTH_RATIO,
            continuous = false,
            reduceMotion = !animated || reduced,
        )
    }
}
