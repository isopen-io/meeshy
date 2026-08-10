package me.meeshy.ui.component.chrome

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private const val LOGO_ANIMATION_DURATION_MS = 600

/**
 * The branded cold-start splash — gradient background (reusing [MeeshyBackground], the same
 * root treatment as every top-level screen) + the animated "stacked-dashes" logo + gradient
 * "Meeshy" wordmark + [tagline]. The Compose analogue of iOS `SplashScreen`
 * (`apps/ios/Meeshy/MeeshyApp.swift`).
 *
 * Deliberately scoped simpler than iOS for this first increment: no pulsing ambient-orb
 * animation (the static orbs already shipped in [MeeshyBackground] are reused as-is) and no
 * footer brand signature — both are documented, not silently dropped. The caller owns *when*
 * this is shown and for how long (product decision, `:app`); this composable only renders it.
 */
@Composable
public fun MeeshySplashScreen(
    tagline: String,
    modifier: Modifier = Modifier,
) {
    val dark = MeeshyTheme.isDark
    val logoColor = if (dark) MeeshyPalette.White else MeeshyPalette.Indigo950
    MeeshyBackground(modifier = modifier) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(MeeshySpacing.xxl),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            SplashLogo(
                color = logoColor,
                modifier = Modifier
                    .size(120.dp)
                    .semantics { contentDescription = "Meeshy" },
            )
            Spacer(modifier = Modifier.height(MeeshySpacing.lg))
            Text(
                text = "Meeshy",
                style = MaterialTheme.typography.displayLarge.copy(
                    brush = Brush.linearGradient(MeeshyPalette.BrandGradient),
                ),
            )
            Spacer(modifier = Modifier.height(MeeshySpacing.xs))
            Text(
                text = tagline,
                style = MaterialTheme.typography.bodyMedium,
                color = MeeshyTheme.tokens.textMuted,
            )
        }
    }
}

/**
 * The animated brand mark: three rounded bars revealed left-to-right in a staggered cascade
 * (top bar first), fading in as they grow — the Compose take on iOS `AnimatedLogoView`'s
 * `.trim(from: 0, to:)` stroke reveal. Geometry + stagger timing live in the pure, tested
 * [SplashLogoGeometry]; this only drives a single `0f..1f` [Animatable] and reads it back.
 */
@Composable
private fun SplashLogo(color: Color, modifier: Modifier = Modifier) {
    val progress = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        progress.animateTo(
            targetValue = 1f,
            animationSpec = tween(durationMillis = LOGO_ANIMATION_DURATION_MS, easing = LinearOutSlowInEasing),
        )
    }
    Canvas(modifier = modifier) {
        val side = size.minDimension
        SplashLogoGeometry.bars.forEachIndexed { index, bar ->
            val barProgress = SplashLogoGeometry.barProgress(progress.value, index)
            if (barProgress <= 0f) return@forEachIndexed
            drawRoundRect(
                color = color.copy(alpha = color.alpha * barProgress),
                topLeft = Offset(bar.left * side, bar.top * side),
                size = Size(bar.width * side * barProgress, bar.height * side),
                cornerRadius = CornerRadius(bar.cornerRadius * side),
            )
        }
    }
}
