package me.meeshy.app.auth

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import me.meeshy.feature.auth.R
import me.meeshy.sdk.model.auth.LinkSignInConfirmationContent
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.auth.AuthActionButton
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * La question « Se connecter en tant que @x ? » (iOS `LinkSignInConfirmationView`, #10880) : le compte
 * du lien se VOIT — avatar, pseudo, nom affiché, adresse masquée — et, pour une revendication
 * d'adresse, la phrase qui dit que l'adresse change de compte.
 *
 * « Annuler » est l'action mise en avant : un lien qu'on n'a pas demandé se refuse d'un geste, et
 * glisser la feuille vers le bas vaut « non ». « Se connecter » ne s'arme qu'un instant après
 * l'apparition ([LinkSignInConfirmationContent.ARMING_DELAY_MS]) — la feuille monte après un
 * aller-retour réseau, sous un doigt qui tapait peut-être déjà ailleurs — et se verrouille pendant la
 * requête de confirmation ([isBusy]), pour qu'un second appui ne la relance pas.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun LinkSignInConfirmationSheet(
    content: LinkSignInConfirmationContent,
    isBusy: Boolean,
    onAnswer: (accepted: Boolean) -> Unit,
) {
    val haptics = rememberMeeshyHaptics()
    var armed by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        delay(LinkSignInConfirmationContent.ARMING_DELAY_MS)
        armed = true
    }
    val confirmAlpha by animateFloatAsState(
        targetValue = if (armed && !isBusy) 1f else 0.5f,
        animationSpec = tween(CONFIRM_ARMING_FADE_MS),
        label = "linkSignInConfirmAlpha",
    )
    val tokens = MeeshyTheme.tokens

    ModalBottomSheet(onDismissRequest = { onAnswer(false) }, containerColor = tokens.backgroundPrimary) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = MeeshySpacing.xxl, vertical = MeeshySpacing.lg),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xl),
        ) {
            Icon(
                imageVector = MeeshyIcons.GppMaybe,
                contentDescription = null,
                tint = MeeshyPalette.Warning,
                modifier = Modifier.size(48.dp),
            )
            Text(
                text = stringResource(R.string.link_signin_title, content.handle),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = tokens.textPrimary,
                textAlign = TextAlign.Center,
                modifier = Modifier.semantics {
                    heading()
                    liveRegion = LiveRegionMode.Polite
                },
            )
            AccountCard(content)
            if (content.claimsEmail) {
                Text(
                    text = stringResource(R.string.link_signin_claim, content.handle),
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = tokens.textPrimary,
                    textAlign = TextAlign.Center,
                )
            }
            Text(
                text = content.currentLabel
                    ?.let { stringResource(R.string.link_signin_message_replacing, content.incomingLabel, it) }
                    ?: stringResource(R.string.link_signin_message, content.incomingLabel),
                style = MaterialTheme.typography.bodyMedium,
                color = tokens.textSecondary,
                textAlign = TextAlign.Center,
            )
            AuthActionButton(
                title = stringResource(R.string.link_signin_cancel),
                onClick = { onAnswer(false) },
                enabled = !isBusy,
            )
            OutlinedButton(
                onClick = {
                    if (armed && !isBusy) {
                        haptics.medium()
                        onAnswer(true)
                    }
                },
                shape = RoundedCornerShape(MeeshyRadius.md),
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 48.dp)
                    .alpha(confirmAlpha),
            ) {
                Text(
                    text = stringResource(
                        if (content.claimsEmail) R.string.link_signin_confirm_claim else R.string.link_signin_confirm,
                    ),
                    fontWeight = FontWeight.SemiBold,
                    color = tokens.textPrimary,
                )
            }
        }
    }
}

@Composable
private fun AccountCard(content: LinkSignInConfirmationContent) {
    val tokens = MeeshyTheme.tokens
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(tokens.inputBackground, RoundedCornerShape(MeeshyRadius.md))
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md)
            .semantics(mergeDescendants = true) { contentDescription = content.accountAccessibilityLabel },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        MeeshyAvatar(name = content.avatarName, size = 56.dp, imageUrl = content.avatarUrl)
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = content.handle,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Bold,
                color = tokens.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            content.displayName?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodySmall,
                    color = tokens.textSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            content.maskedEmail?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodySmall,
                    color = tokens.textSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

private const val CONFIRM_ARMING_FADE_MS = 200
