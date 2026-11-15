package me.meeshy.ui.component.fullscreen

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.fullscreen.FullscreenScrimMetrics
import me.meeshy.sdk.model.fullscreen.FullscreenScrimStop
import me.meeshy.ui.theme.MeeshyMotion

/** Le voile existe pour détacher le chrome : il part et revient avec lui. */
internal fun fullscreenScrimOpacity(chromeVisible: Boolean): Float = if (chromeVisible) 1f else 0f

private fun List<FullscreenScrimStop>.toBrush(): Brush =
    Brush.verticalGradient(*map { it.location to Color.Black.copy(alpha = it.opacity) }.toTypedArray())

/**
 * Le voile de lisibilité du plein écran — celui du lecteur de story, remonté au kit pour que
 * chaque visualiseur le monte au lieu de peindre son propre dégradé. Deux dégradés pleine largeur
 * ancrés au haut et au bas de l'ÉCRAN, sourds au doigt, muets pour TalkBack, et qui suivent le
 * chrome au même ressort : sans chrome, pas de voile — l'image immersive est celle qui a été
 * publiée.
 *
 * [topInset] est la hauteur de la barre d'état, que l'hôte lit sur ses insets : le voile haut la
 * déborde de [FullscreenScrimMetrics.TOP_EXTENT_DP].
 */
@Composable
public fun FullscreenScrims(
    topInset: Dp,
    chromeVisible: Boolean,
    modifier: Modifier = Modifier,
) {
    val scrimAlpha by animateFloatAsState(
        targetValue = fullscreenScrimOpacity(chromeVisible),
        animationSpec = MeeshyMotion.standardSpring(),
        label = "fullscreenScrims",
    )
    Column(
        modifier
            .fillMaxSize()
            .graphicsLayer { alpha = scrimAlpha.coerceIn(0f, 1f) }
            .clearAndSetSemantics { },
    ) {
        Box(
            Modifier
                .fillMaxWidth()
                .height(topInset + FullscreenScrimMetrics.TOP_EXTENT_DP.dp)
                .background(FullscreenScrimMetrics.TOP_STOPS.toBrush()),
        )
        Spacer(Modifier.weight(1f))
        Box(
            Modifier
                .fillMaxWidth()
                .height(FullscreenScrimMetrics.BOTTOM_HEIGHT_DP.dp)
                .background(FullscreenScrimMetrics.BOTTOM_STOPS.toBrush()),
        )
    }
}
