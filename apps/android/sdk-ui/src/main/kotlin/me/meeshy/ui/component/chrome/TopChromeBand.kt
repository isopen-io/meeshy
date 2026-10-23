package me.meeshy.ui.component.chrome

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.statusBars
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import me.meeshy.sdk.model.chrome.TopChromeTint
import me.meeshy.ui.accessibility.LocalReduceMotion

/**
 * La bande pleine largeur dans les insets de la barre d'etat (edge-to-edge), a la couleur de la barre
 * active. Elle ne capte aucun geste. Entre et sort en glissant vers le haut, ou en fondu sous
 * « Reduire les animations » (miroir de iOS `TopChromeBand`).
 */
@Composable
public fun TopChromeBand(tint: TopChromeTint?, modifier: Modifier = Modifier) {
    val reduceMotion = LocalReduceMotion.current
    val lastTint = remember { arrayOf<TopChromeTint?>(null) }
    if (tint != null) lastTint[0] = tint
    val shown = tint ?: lastTint[0]
    val insetTop: Dp = with(LocalDensity.current) { WindowInsets.statusBars.getTop(this).toDp() }
    AnimatedVisibility(
        visible = tint != null,
        modifier = modifier,
        enter = if (reduceMotion) fadeIn(tween(150)) else slideInVertically(spring(dampingRatio = 1f)) { -it },
        exit = if (reduceMotion) fadeOut(tween(150)) else slideOutVertically(spring(dampingRatio = 1f)) { -it },
    ) {
        Box(
            Modifier
                .fillMaxWidth()
                .height(insetTop)
                .background(Color(shown?.bandColorArgb ?: TopChromeTint.CALL_ARGB)),
        )
    }
}
