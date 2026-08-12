package me.meeshy.ui.component.chrome

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
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
 * "Meeshy" wordmark + [tagline] + a footer brand signature ([versionLabel] + [credit] + a small
 * static brand mark). The Compose analogue of iOS `SplashScreen`
 * (`apps/ios/Meeshy/MeeshyApp.swift`) + its shared `BrandSignature` component
 * (`apps/ios/Meeshy/Features/Main/Components/BrandSignature.swift`).
 *
 * Deliberately scoped simpler than iOS for this first increment: no pulsing ambient-orb
 * animation (the static orbs already shipped in [MeeshyBackground] are reused as-is) — a
 * documented cut, not a silent one. Every other iOS element (logo, wordmark, tagline, version
 * signature) is present. The caller owns *when* this is shown, for how long, and resolves
 * [versionLabel]/[credit] from its own build metadata (product decision, `:app`); this
 * composable only renders opaque strings.
 */
@Composable
public fun MeeshySplashScreen(
    tagline: String,
    versionLabel: String,
    credit: String,
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
        BrandSignature(
            versionLabel = versionLabel,
            credit = credit,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = MeeshySpacing.xxl),
        )
    }
}

/**
 * Footer brand signature — three stacked lines: the version line (e.g. "Meeshy 0.1.0 · 3"),
 * the "Services CEO" credit, and a small static brand mark. Port of iOS `BrandSignature`
 * (shared there by the splash and the login screen; Android wires it here first — the login
 * screen is a separate, not-yet-attempted port).
 */
@Composable
private fun BoxScope.BrandSignature(
    versionLabel: String,
    credit: String,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.semantics(mergeDescendants = true) {
            contentDescription = "$versionLabel. $credit."
        },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Text(
            text = versionLabel,
            style = MaterialTheme.typography.labelSmall,
            color = MeeshyTheme.tokens.textMuted.copy(alpha = 0.9f),
        )
        Text(
            text = credit,
            style = MaterialTheme.typography.labelSmall,
            color = MeeshyTheme.tokens.textMuted.copy(alpha = 0.7f),
        )
        StackedDashesMark(
            color = MeeshyPalette.Error,
            progress = 1f,
            modifier = Modifier.size(28.dp),
        )
    }
}

/**
 * The animated brand mark: three rounded bars revealed left-to-right in a staggered cascade
 * (top bar first), fading in as they grow — the Compose take on iOS `AnimatedLogoView`'s
 * `.trim(from: 0, to:)` stroke reveal. Geometry + stagger timing live in the pure, tested
 * [SplashLogoGeometry]; this only drives a single `0f..1f` [Animatable] and hands the current
 * value to [StackedDashesMark].
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
    StackedDashesMark(color = color, progress = progress.value, modifier = modifier)
}

/**
 * Draws the three-bar "stacked-dashes" glyph at [progress] (0f..1f, per-bar via
 * [SplashLogoGeometry.barProgress]) — shared by the large animated [SplashLogo] and the small
 * static mark in [BrandSignature] (`progress = 1f`, fully revealed, no animation), so the two
 * brand-mark renders can never drift apart.
 */
@Composable
private fun StackedDashesMark(color: Color, progress: Float, modifier: Modifier = Modifier) {
    Canvas(modifier = modifier) {
        val side = size.minDimension
        SplashLogoGeometry.bars.forEachIndexed { index, bar ->
            val barProgress = SplashLogoGeometry.barProgress(progress, index)
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
