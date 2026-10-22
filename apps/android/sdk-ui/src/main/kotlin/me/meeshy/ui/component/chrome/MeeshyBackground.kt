package me.meeshy.ui.component.chrome

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.BlurredEdgeTreatment
import androidx.compose.ui.draw.blur
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.ui.theme.MeeshyGradients
import me.meeshy.ui.theme.ThemePalette
import me.meeshy.ui.theme.MeeshyTheme

/**
 * The root background of every top-level screen — the Meeshy gradient plus a few
 * four soft ambient orbs (300/350/250/200 dp, iOS `ThemePalette.ambientOrbs`), the port of iOS `RootView` (parity plan §4.1). Wrap a screen's
 * content in this and make the `Scaffold` container transparent so the gradient
 * shows through.
 *
 * Orbs use `Modifier.blur` (Android 12+/API 31+; a low-opacity sharp disc on older
 * API levels — an acceptable degradation), matching iOS `blur(radius: size*0.25)`.
 */
@Composable
fun MeeshyBackground(
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit,
) {
    val dark = MeeshyTheme.isDark
    Box(
        modifier
            .fillMaxSize()
            .background(MeeshyGradients.mainBackground(dark)),
    ) {
        AmbientOrbs(dark)
        content()
    }
}

@Composable
private fun BoxScope.AmbientOrbs(dark: Boolean) {
    ThemePalette.ambientOrbsFor(dark).forEach { orb ->
        Orb(
            color = orb.color,
            size = orb.sizeDp.dp,
            modifier = Modifier.align(Alignment.Center).offset(x = orb.offsetXDp.dp, y = orb.offsetYDp.dp),
        )
    }
}

@Composable
private fun Orb(color: Color, size: Dp, modifier: Modifier) {
    Box(
        modifier
            .size(size)
            .blur(size * 0.25f, edgeTreatment = BlurredEdgeTreatment.Unbounded)
            .background(color, CircleShape),
    )
}
