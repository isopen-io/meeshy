package me.meeshy.ui.component.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyGradients
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.meeshyText

/** La part remplie de la jauge, dans [0, 1] ; un seuil nul ou négatif la dit pleine. */
public fun levelGaugeFraction(points: Int, threshold: Int): Float =
    if (threshold <= 0) 1f else (points.coerceAtLeast(0).toFloat() / threshold).coerceAtMost(1f)

/**
 * « 0 / 10 pts pour ton niveau 1 » (iOS `OnboardingLevelGauge`). Elle se remplit dans le sens de
 * lecture — de droite à gauche en arabe, sans rien écrire pour ça. Le libellé est donné par
 * l'appelant : l'atome ne connaît aucune chaîne de parcours.
 */
@Composable
public fun LevelGauge(
    points: Int,
    threshold: Int,
    label: String,
    modifier: Modifier = Modifier,
) {
    val isDark = MeeshyTheme.isDark
    val reached = threshold > 0 && points >= threshold
    val tokens = MeeshyTheme.tokens
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clearAndSetSemantics { contentDescription = label },
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = if (reached) Icons.Filled.Star else Icons.Outlined.Star,
                contentDescription = null,
                tint = if (reached) tokens.warning else MeeshyPalette.Indigo400,
                modifier = Modifier.size(18.dp),
            )
            Text(
                text = label,
                color = tokens.textSecondary,
                style = meeshyText(MeeshyFontSize.subhead, FontWeight.SemiBold, rounded = true),
            )
        }
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(10.dp)
                .clip(CircleShape)
                .background(if (isDark) MeeshyPalette.White.copy(alpha = 0.08f) else MeeshyPalette.Indigo100),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(levelGaugeFraction(points, threshold))
                    .widthIn(min = 10.dp)
                    .height(10.dp)
                    .alpha(if (points == 0) 0.35f else 1f)
                    .clip(CircleShape)
                    .background(MeeshyGradients.brand),
            )
        }
    }
}
