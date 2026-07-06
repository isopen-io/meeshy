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
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

/**
 * The root background of every top-level screen — the Meeshy gradient plus a few
 * soft ambient orbs, the port of iOS `RootView` (parity plan §4.1). Wrap a screen's
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
    val scale = if (dark) 1f else 0.6f
    Orb(
        color = MeeshyPalette.Indigo500.copy(alpha = 0.14f * scale),
        size = 260.dp,
        modifier = Modifier.align(Alignment.TopEnd).offset(x = 90.dp, y = (-70).dp),
    )
    Orb(
        color = MeeshyPalette.Indigo700.copy(alpha = 0.12f * scale),
        size = 320.dp,
        modifier = Modifier.align(Alignment.BottomStart).offset(x = (-100).dp, y = 80.dp),
    )
    Orb(
        color = MeeshyPalette.Indigo400.copy(alpha = 0.08f * scale),
        size = 200.dp,
        modifier = Modifier.align(Alignment.Center).offset(y = (-30).dp),
    )
}

@Composable
private fun Orb(color: Color, size: Dp, modifier: Modifier) {
    Box(
        modifier
            .size(size)
            .blur(70.dp, edgeTreatment = BlurredEdgeTreatment.Unbounded)
            .background(color, CircleShape),
    )
}
