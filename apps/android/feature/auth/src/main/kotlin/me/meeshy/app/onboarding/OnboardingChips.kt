package me.meeshy.app.onboarding

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Stars
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyGradients
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.meeshyText

internal const val ONBOARDING_CHIP_TAG = "onboarding.chip"
internal const val ONBOARDING_GAUGE_TAG = "onboarding.levelGauge"

/** Une puce sélectionnable (langue, audience), jamais moins de 48 dp de haut (iOS `OnboardingChip`). */
@Composable
internal fun OnboardingChip(title: String, isSelected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val isDark = MeeshyTheme.isDark
    val unselectedFill = if (isDark) MeeshyPalette.White.copy(alpha = 0.08f) else MeeshyPalette.Indigo50
    val unselectedBorder = MeeshyPalette.Indigo200.copy(alpha = if (isDark) 0.25f else 1f)
    val fill = if (isSelected) Modifier.background(MeeshyGradients.brand, CircleShape) else Modifier.background(unselectedFill, CircleShape)
    Row(
        modifier = modifier
            .testTag(ONBOARDING_CHIP_TAG)
            .heightIn(min = 48.dp)
            .clip(CircleShape)
            .then(fill)
            .then(if (isSelected) Modifier else Modifier.border(BorderStroke(1.dp, unselectedBorder), CircleShape))
            .clickable(onClick = onClick)
            .semantics(mergeDescendants = true) {
                role = Role.Button
                selected = isSelected
            }
            .padding(horizontal = MeeshySpacing.lg),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = title,
            color = if (isSelected) MeeshyPalette.White else MeeshyTheme.tokens.textPrimary,
            style = meeshyText(MeeshyFontSize.body, FontWeight.Medium, rounded = true),
        )
    }
}

/**
 * « 3 / 10 étincelles pour le niveau 1 » et la barre qui se remplit dans le sens de lecture —
 * de droite à gauche en arabe, sans rien écrire pour ça : le remplissage est aligné sur le début
 * (iOS `OnboardingLevelGauge`).
 */
@Composable
internal fun OnboardingLevelGauge(points: Int, threshold: Int, modifier: Modifier = Modifier) {
    val isDark = MeeshyTheme.isDark
    val reached = points >= threshold
    val label = onboardingGaugeLabel(points, threshold)
    val fraction = OnboardingGaugeMath.fraction(points, threshold)
    val track = if (isDark) MeeshyPalette.White.copy(alpha = 0.08f) else MeeshyPalette.Indigo100
    Column(
        modifier = modifier.fillMaxWidth().testTag(ONBOARDING_GAUGE_TAG).clearAndSetSemantics { contentDescription = label },
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs), verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = if (reached) Icons.Filled.Stars else Icons.Outlined.Star,
                contentDescription = null,
                tint = if (reached) MeeshyPalette.Warning else MeeshyPalette.Indigo400,
            )
            Text(
                text = label,
                color = MeeshyTheme.tokens.textSecondary,
                style = meeshyText(MeeshyFontSize.subhead, FontWeight.SemiBold, rounded = true),
            )
        }
        BoxWithConstraints(Modifier.fillMaxWidth().height(10.dp).clip(CircleShape).background(track)) {
            val fillWidth = maxOf(10.dp, maxWidth * fraction)
            Row(
                Modifier
                    .width(fillWidth)
                    .height(10.dp)
                    .alpha(OnboardingGaugeMath.fillAlpha(points))
                    .background(MeeshyGradients.brand, CircleShape),
            ) {}
        }
    }
}
