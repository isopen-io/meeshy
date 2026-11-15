package me.meeshy.ui.component.skeleton

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.loading.LoadingSheenLaw
import me.meeshy.sdk.model.loading.LoadingSheenPhase
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshyOpacity
import me.meeshy.ui.theme.MeeshyTheme

/** Miroir de `LoadingSheenStyle` (iOS) : l'unique reflet de chargement du SDK. */
@Immutable
public data class LoadingSheenStyle(
    val tint: Color,
    /** Largeur fixe de la bande, ou `null` pour une fraction de la largeur ([bandFraction]). */
    val bandWidth: Dp?,
    val bandFraction: Float,
    val durationMillis: Int,
    /** `true` : le reflet ne se dessine que sur les pixels du contenu. `false` : il couvre tout le cadre. */
    val masksToContent: Boolean,
) {
    public companion object {
        public const val SKELETON_BAND_DP: Int = 120
        public const val SKELETON_DURATION_MILLIS: Int = 1_500
        public const val VEIL_BAND_FRACTION: Float = 0.6f
        public const val VEIL_DURATION_MILLIS: Int = 2_000
        public const val VEIL_WHITE_ALPHA: Float = 0.15f

        /** Tenue de `.shimmer()` : voile blanc 15 %, bande a 60 % de la largeur, 2 s. */
        public val Veil: LoadingSheenStyle = LoadingSheenStyle(
            tint = Color.White.copy(alpha = VEIL_WHITE_ALPHA),
            bandWidth = null,
            bandFraction = VEIL_BAND_FRACTION,
            durationMillis = VEIL_DURATION_MILLIS,
            masksToContent = true,
        )

        /** Tenue de `.skeletonShimmer()` : bande de 120 dp, 1,5 s, teinte donnee (textMuted 30 %). */
        public fun skeleton(tint: Color): LoadingSheenStyle = LoadingSheenStyle(
            tint = tint,
            bandWidth = SKELETON_BAND_DP.dp,
            bandFraction = 0f,
            durationMillis = SKELETON_DURATION_MILLIS,
            masksToContent = false,
        )
    }
}

/** Etat de chargement reel declare par l'hote d'un placeholder ; defaut [LoadingSheenPhase.LOADING]. */
public val LocalLoadingSheenPhase = compositionLocalOf { LoadingSheenPhase.LOADING }

/** Le seul modificateur de reflet anime du SDK : ne balaie que pendant un vrai chargement, jamais en mouvement reduit. */
public fun Modifier.loadingSheen(style: LoadingSheenStyle): Modifier = composed {
    val animates = LoadingSheenLaw.animates(LocalLoadingSheenPhase.current, LocalReduceMotion.current)
    if (!animates) return@composed this
    val progress = rememberInfiniteTransition(label = "loading-sheen").animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(style.durationMillis, easing = LinearEasing), RepeatMode.Restart),
        label = "loading-sheen-sweep",
    )
    val base = if (style.masksToContent) graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen } else clipToBounds()
    base.drawWithContent {
        drawContent()
        val band = style.bandWidth?.toPx() ?: (size.width * style.bandFraction)
        if (band <= 0f || size.width <= 0f) return@drawWithContent
        val x = -band + (size.width + band) * progress.value
        val clear = style.tint.copy(alpha = 0f)
        drawRect(
            brush = Brush.horizontalGradient(
                colors = listOf(clear, style.tint, clear),
                startX = x,
                endX = x + band,
            ),
            topLeft = Offset(x, 0f),
            size = androidx.compose.ui.geometry.Size(band, size.height),
            blendMode = if (style.masksToContent) BlendMode.SrcAtop else BlendMode.SrcOver,
        )
    }
}

/** `.skeletonShimmer()` : teinte textMuted a 30 %. */
@Composable
public fun Modifier.skeletonShimmer(): Modifier =
    loadingSheen(LoadingSheenStyle.skeleton(MeeshyTheme.tokens.textMuted.copy(alpha = MeeshyOpacity.medium)))

/** `.shimmer()` : le voile blanc. */
public fun Modifier.veilShimmer(): Modifier = loadingSheen(LoadingSheenStyle.Veil)
