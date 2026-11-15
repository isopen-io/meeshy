package me.meeshy.app.onboarding

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyGradients
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.meeshyText

/** Un geste proposé par une carte. [tag] est la poignée des tests : il ne dit rien à l'utilisateur. */
@Immutable
internal data class OnboardingAction(
    val title: String,
    val tag: String,
    val isEnabled: Boolean = true,
    val isBusy: Boolean = false,
    val perform: () -> Unit,
)

/**
 * Désactivé, le bouton reste OPAQUE : une capsule translucide laisserait lire le contenu qui
 * défile dessous, à travers le libellé (iOS `OnboardingPrimaryButton`).
 */
@Composable
internal fun OnboardingPrimaryButton(action: OnboardingAction, modifier: Modifier = Modifier) {
    val isDark = MeeshyTheme.isDark
    val live = action.isEnabled && !action.isBusy
    val fill: Brush = when {
        action.isEnabled -> MeeshyGradients.brand
        isDark -> SolidColor(MeeshyPalette.Indigo900)
        else -> SolidColor(MeeshyPalette.Indigo200)
    }
    val ink = when {
        action.isEnabled -> MeeshyPalette.White
        isDark -> MeeshyPalette.White.copy(alpha = 0.6f)
        else -> MeeshyPalette.Indigo600
    }
    Box(
        modifier = modifier
            .fillMaxWidth()
            .shadow(
                elevation = if (action.isEnabled) 8.dp else 0.dp,
                shape = CircleShape,
                ambientColor = MeeshyPalette.Indigo500,
                spotColor = MeeshyPalette.Indigo500,
            )
            .clip(CircleShape)
            .background(fill)
            .heightIn(min = 54.dp)
            .clickable(enabled = live, role = Role.Button, onClick = action.perform)
            .padding(horizontal = MeeshySpacing.lg)
            .testTag(action.tag)
            .semantics { if (!action.isEnabled) disabled() },
        contentAlignment = Alignment.Center,
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (action.isBusy) {
                CircularProgressIndicator(Modifier.size(18.dp), color = MeeshyPalette.White, strokeWidth = 2.dp)
            }
            Text(
                text = action.title,
                color = ink,
                style = meeshyText(MeeshyFontSize.headline, FontWeight.SemiBold, rounded = true),
                textAlign = TextAlign.Center,
            )
        }
    }
}

/** « Plus tard » : un texte, jamais un second bouton plein (iOS `OnboardingSecondaryButton`). */
@Composable
internal fun OnboardingSecondaryButton(action: OnboardingAction, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .clickable(enabled = action.isEnabled, role = Role.Button, onClick = action.perform)
            .testTag(action.tag),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = action.title,
            color = MeeshyTheme.tokens.textSecondary,
            style = meeshyText(MeeshyFontSize.body, FontWeight.SemiBold, rounded = true),
            textAlign = TextAlign.Center,
        )
    }
}
