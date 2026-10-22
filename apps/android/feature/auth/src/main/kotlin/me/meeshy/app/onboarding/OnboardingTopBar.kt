package me.meeshy.app.onboarding

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.auth.R
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.meeshyText

internal const val ONBOARDING_SKIP_ALL_TAG = "onboarding.skipAll"

/**
 * La barre du haut : pastille de points à l'avant, « Tout passer » à l'arrière, et — pendant les
 * étapes — la progression dessous. Au récapitulatif, ce sont les chiffres RELUS du serveur qui
 * parlent : la pastille de session les contredirait, et il n'y a plus rien à passer.
 */
@Composable
internal fun OnboardingTopBar(
    showChrome: Boolean,
    progressPosition: Int,
    progressCount: Int,
    onSkipAll: () -> Unit,
    isDark: Boolean,
    modifier: Modifier = Modifier,
    pointsChip: @Composable () -> Unit,
) {
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            if (showChrome) pointsChip()
            Box(modifier = Modifier.weight(1f).widthIn(min = MeeshySpacing.md))
            if (showChrome) {
                Box(
                    modifier = Modifier
                        .heightIn(min = 48.dp)
                        .clickable(role = Role.Button, onClick = onSkipAll)
                        .padding(horizontal = MeeshySpacing.sm)
                        .testTag(ONBOARDING_SKIP_ALL_TAG),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = stringResource(R.string.onboarding_skipAll),
                        color = MeeshyTheme.tokens.textSecondary,
                        style = meeshyText(MeeshyFontSize.body, FontWeight.SemiBold, rounded = true),
                    )
                }
            }
        }
        if (progressCount > 0) OnboardingProgressBar(progressPosition, progressCount, isDark)
    }
}
