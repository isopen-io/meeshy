package me.meeshy.app.stories

import android.os.Build
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.SceneShape
import me.meeshy.sdk.model.story.StoryReaderCanvasLayout
import me.meeshy.sdk.model.story.StoryReaderSceneFocus
import me.meeshy.ui.accessibility.LocalReduceMotion

/** Ce que l'hôte dit de l'état du chrome ; la carte en déduit sa présentation (iOS `StoryReaderCanvasLayout`). */
internal data class StoryReaderCardState(
    val chromeVisible: Boolean,
    val isFullscreenSession: Boolean = false,
    val commentsOpen: Boolean = false,
    val composerReserveDp: Float? = null,
)

/**
 * La carte 9:16 du lecteur : coins arrondis (22) et ombre (rayon 20, décalage 8, 0,4) au repos, recadrage animé vers le
 * plein bord quand le chrome s'efface, flou de lecture sous les commentaires. La scène (et ses textes, dont la taille
 * dérive de la LARGEUR de la carte) est posée DANS la carte ; le sol et le fond restent autour. Le ressort de la carte
 * est celui du cadrage ; sous « Réduire les animations » elle se pose sans mouvement.
 */
@Composable
internal fun StoryReaderSceneCard(
    state: StoryReaderCardState,
    floor: @Composable (expanded: Boolean) -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit,
) {
    val density = LocalDensity.current
    val reduceMotion = LocalReduceMotion.current
    val statusBarTopPx = with(density) { WindowInsets.statusBars.asPaddingValues().calculateTopPadding().toPx() }
    BoxWithConstraints(modifier.fillMaxSize()) {
        val viewportW = with(density) { maxWidth.toPx() }
        val viewportH = with(density) { maxHeight.toPx() }
        val reserve = state.composerReserveDp?.let { with(density) { it.dp.toPx() } }
        val expanded = StoryReaderCanvasLayout.isExpanded(state.isFullscreenSession, state.chromeVisible, lifted = reserve != null)
        val framing = StoryReaderCanvasLayout.framing(
            viewportWidth = viewportW,
            viewportHeight = viewportH,
            topInset = statusBarTopPx,
            isFullscreenSession = state.isFullscreenSession,
            chromeVisible = state.chromeVisible,
            composerReserve = reserve,
        )
        val spec = if (reduceMotion) tween<Float>(0) else spring(dampingRatio = 0.84f, stiffness = 380f)
        val scale by animateFloatAsState(framing.scale, spec, label = "storyCardScale")
        val offsetY by animateFloatAsState(framing.offsetY, spec, label = "storyCardOffset")
        val corner by animateFloatAsState(framing.cornerRadius, spec, label = "storyCardCorner")
        val shadow by animateFloatAsState(StoryReaderCanvasLayout.shadowAlpha(expanded), spec, label = "storyCardShadow")
        val blurRadius by animateDpAsState(
            StoryReaderSceneFocus.blurRadius(state.commentsOpen).dp,
            if (reduceMotion) tween(120) else tween(250),
            label = "storyCardBlur",
        )
        val cardW = minOf(viewportW, viewportH * SceneShape.ASPECT.toFloat())
        val cardH = cardW / SceneShape.ASPECT.toFloat()
        val shape = remember(corner, scale) { RoundedCornerShape(if (scale > 0f) corner / scale else corner) }
        val shadowPx = with(density) { StoryReaderCanvasLayout.SHADOW_RADIUS_DP.dp.toPx() }

        floor(expanded)
        Box(
            modifier = Modifier
                .align(Alignment.Center)
                .size(with(density) { cardW.toDp() }, with(density) { cardH.toDp() })
                .graphicsLayer {
                    scaleX = scale
                    scaleY = scale
                    translationY = offsetY
                    this.shape = shape
                    clip = true
                    shadowElevation = shadowPx * shadow / StoryReaderCanvasLayout.SHADOW_ALPHA
                    ambientShadowColor = Color.Black.copy(alpha = shadow)
                    spotShadowColor = Color.Black.copy(alpha = shadow)
                }
                .then(if (blurRadius.value > 0f && Build.VERSION.SDK_INT >= 31) Modifier.blur(blurRadius) else Modifier),
            content = content,
        )
    }
}
