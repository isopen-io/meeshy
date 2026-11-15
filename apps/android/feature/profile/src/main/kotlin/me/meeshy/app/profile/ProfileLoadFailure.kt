package me.meeshy.app.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.feature.profile.R
import me.meeshy.ui.accessibility.MeeshyMinTapTarget
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

internal const val PROFILE_RETRY_TAG = "profile-sheet-retry"

/**
 * Le profil n'a pas pu se charger et le cache n'a rien à montrer (miroir de
 * `profileLoadFailedState` iOS, #8025) : la fiche le dit au lieu d'onglets vides. [onRetry] nul =
 * refus de la passerelle : le message reste, Réessayer disparaît (rejouer ne changerait rien).
 */
@Composable
internal fun ProfileLoadFailure(
    accent: Color,
    onRetry: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    val message = stringResource(R.string.profile_loadFailed_message)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.xl, vertical = MeeshySpacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Icon(
            imageVector = MeeshyIcons.WifiProblem,
            contentDescription = null,
            tint = MeeshyTheme.tokens.textMuted,
            modifier = Modifier.size(28.dp),
        )
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            color = MeeshyTheme.tokens.textSecondary,
            textAlign = TextAlign.Center,
        )
        if (onRetry != null) {
            Box(
                modifier = Modifier
                    .heightIn(min = MeeshyMinTapTarget)
                    .clip(CircleShape)
                    .background(accent)
                    .clickable(role = Role.Button, onClick = onRetry)
                    .testTag(PROFILE_RETRY_TAG)
                    .padding(horizontal = MeeshySpacing.xl),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = stringResource(R.string.common_retry),
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = Color.White,
                )
            }
        }
    }
}
