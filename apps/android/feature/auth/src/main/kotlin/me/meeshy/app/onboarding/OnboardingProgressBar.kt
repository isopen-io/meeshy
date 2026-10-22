package me.meeshy.app.onboarding

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.unit.dp
import me.meeshy.feature.auth.R
import me.meeshy.ui.theme.MeeshyGradients
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

/**
 * Une capsule par étape ; celles déjà franchies sont pleines, la courante occupe la place qui
 * reste (iOS `OnboardingProgressBar`). Le lecteur d'écran ne lit que « Étape p sur n ».
 */
@Composable
internal fun OnboardingProgressBar(position: Int, count: Int, isDark: Boolean, modifier: Modifier = Modifier) {
    val description = stringResource(R.string.onboarding_progress_a11y, position, count)
    val track: Brush = SolidColor(if (isDark) MeeshyPalette.White.copy(alpha = 0.12f) else MeeshyPalette.Indigo100)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clearAndSetSemantics { contentDescription = description },
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
    ) {
        repeat(maxOf(count, 1)) { index ->
            val width = if (index == position - 1) Modifier.weight(1f) else Modifier.width(44.dp)
            Box(
                modifier = width
                    .height(6.dp)
                    .clip(CircleShape)
                    .background(if (index < position) MeeshyGradients.brand else track),
            )
        }
    }
}

/** « 3 / 10 étincelles pour le niveau 1 », ou la phrase d'arrivée une fois le seuil atteint. */
@Composable
internal fun onboardingGaugeLabel(points: Int, threshold: Int): String =
    if (points >= threshold) {
        stringResource(R.string.onboarding_gauge_reached)
    } else {
        stringResource(R.string.onboarding_gauge_level1, points.coerceAtLeast(0), threshold)
    }
