package me.meeshy.app.onboarding

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import me.meeshy.ui.theme.MeeshyGradients
import me.meeshy.ui.theme.MeeshyPalette

/**
 * Le fond du parcours : le dégradé de l'app et deux halos IMMOBILES — la couleur de la marque
 * sans mouvement perpétuel (iOS `OnboardingBackdrop`).
 */
@Composable
internal fun OnboardingBackdrop(isDark: Boolean, modifier: Modifier = Modifier) {
    val indigo = MeeshyPalette.Indigo500.copy(alpha = if (isDark) 0.35f else 0.22f)
    val purple = MeeshyPalette.Purple500.copy(alpha = if (isDark) 0.28f else 0.16f)
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(MeeshyGradients.mainBackground(isDark))
            .drawBehind {
                val radius = 200.dp.toPx()
                val centre = Offset(size.width / 2f, size.height / 2f)
                val first = centre + Offset(-140.dp.toPx(), -300.dp.toPx())
                val second = centre + Offset(160.dp.toPx(), 320.dp.toPx())
                drawCircle(Brush.radialGradient(listOf(indigo, Color.Transparent), first, radius), radius, first)
                drawCircle(Brush.radialGradient(listOf(purple, Color.Transparent), second, radius), radius, second)
            }
            .clearAndSetSemantics {},
    )
}
