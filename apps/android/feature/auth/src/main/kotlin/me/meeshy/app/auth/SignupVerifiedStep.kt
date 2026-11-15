package me.meeshy.app.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.feature.auth.R
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

internal const val SIGNUP_VERIFIED_TAG: String = "signup.card.verified"
internal const val SIGNUP_VERIFIED_SEAL_TAG: String = "signup.card.verified.seal"
internal const val SIGNUP_VERIFIED_SIGN_IN_TAG: String = "signup.card.verified.signIn"

private val SEAL_DISC = 72.dp
private val SEAL_ICON = 40.dp
private const val SEAL_TINT = 0.16f

/**
 * « Compte validé ! » (iOS `verifiedStep`) : un disque vert de 72 dp porte le sceau, puis le titre et « Tout est
 * prêt : vos proches vous lisent dans votre langue ». La réussite se sent (haptique de succès) et s'entend
 * (annonce TalkBack) à l'apparition. Le feu d'artifice, lui, appartient à la CARTE ([SignupIdentityCard]) : il
 * se clippe à sa forme et se tait sous animations réduites.
 *
 * [openRefused] dit un refus d'ouverture de session sans quitter la carte ; [needsSignIn] (le compte est validé
 * mais aucune session n'est plus à ouvrir ici) propose « Se connecter ».
 */
@Composable
internal fun SignupVerifiedStep(
    openRefused: Boolean,
    needsSignIn: Boolean,
    onSignIn: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = MeeshyTheme.tokens
    val title = stringResource(R.string.signup_card_verified)
    val haptics = rememberMeeshyHaptics()
    val view = LocalView.current
    LaunchedEffect(Unit) {
        haptics.success()
        view.announceForAccessibility(title)
    }
    Column(
        modifier = modifier.fillMaxWidth().testTag(SIGNUP_VERIFIED_TAG),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Box(
            modifier = Modifier
                .size(SEAL_DISC)
                .background(tokens.success.copy(alpha = SEAL_TINT), CircleShape)
                .testTag(SIGNUP_VERIFIED_SEAL_TAG),
            contentAlignment = Alignment.Center,
        ) {
            Icon(MeeshyIcons.Verified, contentDescription = null, tint = tokens.success, modifier = Modifier.size(SEAL_ICON))
        }
        Text(
            text = title,
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            color = tokens.textPrimary,
            textAlign = TextAlign.Center,
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
        )
        Text(
            text = stringResource(R.string.signup_card_verified_lead),
            style = MaterialTheme.typography.bodySmall,
            color = tokens.textSecondary,
            textAlign = TextAlign.Center,
        )
        when {
            needsSignIn -> {
                Text(
                    text = stringResource(R.string.signup_verified_no_session),
                    style = MaterialTheme.typography.bodySmall,
                    color = tokens.textSecondary,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                )
                TextButton(
                    onClick = onSignIn,
                    modifier = Modifier.heightIn(min = 48.dp).testTag(SIGNUP_VERIFIED_SIGN_IN_TAG),
                ) {
                    Text(
                        text = stringResource(R.string.signup_sign_in),
                        fontWeight = FontWeight.SemiBold,
                        color = MeeshyPalette.Indigo500,
                    )
                }
            }
            openRefused -> Text(
                text = stringResource(R.string.signup_verified_open_failed),
                style = MaterialTheme.typography.bodySmall,
                color = tokens.error,
                textAlign = TextAlign.Center,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
            )
        }
    }
}
