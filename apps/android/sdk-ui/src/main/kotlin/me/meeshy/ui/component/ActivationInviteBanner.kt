package me.meeshy.ui.component

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.ActivationInvite
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.MeeshyThemeTokens

/**
 * Le bandeau discret d'invitation a valider son compte (phase `invite`, #8239) : jamais une
 * fenetre bloquante. Sans [invite] (hors phase `invite` ou rien a demander), il ne dessine rien.
 * Les libelles arrivent localises de l'hote. Son fond est PLEIN (#13854) : rien de ce qu'il
 * recouvre ne se lit a travers lui, en clair comme en sombre. Il se pose dans [ActivationInviteBand],
 * qui range l'ecran dessous.
 */
public object ActivationInviteBannerDefaults {
    public const val TEST_TAG: String = "activationInviteBanner"
    public const val BAND_TAG: String = "activationInviteBand"

    /** La teinte indigo d'origine, POSEE sur le fond du theme : la meme couleur, sans alpha. */
    public fun containerColor(tokens: MeeshyThemeTokens): Color =
        MeeshyPalette.Indigo500.copy(alpha = 0.12f).compositeOver(tokens.backgroundPrimary)
}

@Composable
public fun ActivationInviteBanner(
    invite: ActivationInvite?,
    title: String,
    message: String,
    dismissLabel: String,
    onOpen: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (invite == null) return
    val shape = RoundedCornerShape(MeeshySpacing.md)
    Row(
        modifier = modifier
            .testTag(ActivationInviteBannerDefaults.TEST_TAG)
            .fillMaxWidth()
            .background(ActivationInviteBannerDefaults.containerColor(MeeshyTheme.tokens), shape)
            .clickable(role = Role.Button, onClick = onOpen)
            .heightIn(min = 48.dp)
            .padding(start = MeeshySpacing.md, end = MeeshySpacing.xs, top = MeeshySpacing.xs, bottom = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.labelLarge,
                color = MeeshyTheme.tokens.textPrimary,
            )
            Text(
                text = message,
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textSecondary,
            )
        }
        TextButton(onClick = onDismiss) { Text(dismissLabel) }
    }
}
