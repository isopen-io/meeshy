package me.meeshy.app.feed

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.feed.R
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Ce que le fil dit d'un geste sur une publication en attente (iOS `StuckPublicationRetry`, `withdrawPendingPublication`).
 * Chaque valeur est un retour dit une fois, dans la langue du lecteur.
 */
internal enum class PendingFeedback(@StringRes val messageRes: Int, val isError: Boolean) {
    RETRY_STARTED(R.string.feed_pending_retry_started, isError = false),
    RETRY_FAILED(R.string.feed_pending_retry_failed, isError = true),
    WITHDRAWN(R.string.feed_pending_withdrawn, isError = false),
    ALREADY_SENT(R.string.feed_pending_already_sent, isError = true),
    WITHDRAW_FAILED(R.string.feed_pending_withdraw_failed, isError = true),
    DRAFT_RECOVERED(R.string.feed_draft_recovered, isError = false),
}

/**
 * La puce d'une publication qui n'est pas partie, sous sa carte : « En attente », « Réessayer » quand elle a abandonné,
 * et l'annulation de l'envoi. Les gestes sont ceux du ⋯ ([PendingSendActions]) ; la puce les met sous le pouce.
 */
@Composable
internal fun FeedPendingPublicationChip(actions: PendingSendActions, modifier: Modifier = Modifier) {
    val haptics = rememberMeeshyHaptics()
    Row(
        modifier = modifier.fillMaxWidth().padding(top = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Surface(
            shape = RoundedCornerShape(MeeshyRadius.lg),
            color = MeeshyPalette.Warning.copy(alpha = CHIP_FILL_ALPHA),
        ) {
            Text(
                text = stringResource(R.string.feed_pending_chip),
                style = MaterialTheme.typography.labelMedium,
                color = MeeshyTheme.tokens.textPrimary,
                modifier = Modifier.padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs),
            )
        }
        if (actions.canRetry) {
            TextButton(onClick = { haptics.light(); actions.onRetry() }) {
                Text(stringResource(R.string.feed_retry))
            }
        }
        Row(Modifier.weight(1f), horizontalArrangement = Arrangement.End) {
            IconButton(onClick = { haptics.medium(); actions.onCancel() }) {
                Icon(
                    imageVector = MeeshyIcons.Close,
                    contentDescription = stringResource(R.string.feed_pending_cancel_send),
                    tint = MeeshyTheme.tokens.textSecondary,
                )
            }
        }
    }
}

private const val CHIP_FILL_ALPHA = 0.25f
