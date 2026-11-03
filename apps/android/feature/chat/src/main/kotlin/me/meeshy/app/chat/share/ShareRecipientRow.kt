package me.meeshy.app.chat.share

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.share.ShareFailure
import me.meeshy.sdk.model.share.ShareRecipient
import me.meeshy.sdk.model.share.ShareRecipientRowModel
import me.meeshy.sdk.model.share.ShareRowStatus
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

internal const val ShareRecipientRowTestTag = "share-recipient-row"

/** The sentence a failed delivery is told with — never a raw server text. */
@Composable
internal fun shareFailureText(failure: ShareFailure): String = stringResource(
    when (failure) {
        ShareFailure.SEALED_SOURCE -> R.string.share_refused_undecrypted_source
        ShareFailure.SEALED_DESTINATION -> R.string.share_refused_encrypted_destination
        ShareFailure.NOTHING_TO_SEND, ShareFailure.UNREACHABLE, ShareFailure.GENERIC -> R.string.share_error_generic
    },
)

/**
 * One recipient row of the « À qui » zone (iOS `ShareRecipientRow`): >= 48 dp, 40 dp avatar at the
 * conversation accent, the served presence (friends only, nothing fabricated), a tick, and the delivery
 * state — sending, sent, queued, or failed with « Réessayer ». One merged TalkBack node per row.
 */
@Composable
internal fun ShareRecipientRow(
    model: ShareRecipientRowModel,
    accentColor: Color,
    onToggle: () -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val recipient = model.recipient
    val detail = shareDetailText(recipient.detail)
    val statusText = shareStatusText(model)
    val spoken = model.spokenLabel(
        detail = detail,
        onlineText = stringResource(R.string.share_a11y_online),
        selectedText = stringResource(R.string.share_a11y_selected),
        statusText = statusText,
    )
    Row(
        modifier = modifier.fillMaxWidth().heightIn(min = 48.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            modifier = Modifier
                .weight(1f)
                .heightIn(min = 48.dp)
                .clickable(enabled = !model.isServed, onClick = onToggle)
                .testTag(ShareRecipientRowTestTag)
                .semantics(mergeDescendants = true) {
                    contentDescription = spoken
                    role = Role.Checkbox
                    selected = model.selected
                }
                .padding(start = MeeshySpacing.lg, top = MeeshySpacing.sm, bottom = MeeshySpacing.sm, end = MeeshySpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        ) {
            MeeshyAvatar(
                name = recipient.title,
                size = 40.dp,
                containerColor = recipient.accentHex?.let { hexColor(it) }?.takeIf { it != Color.Unspecified } ?: accentColor,
                imageUrl = recipient.avatarUrl,
                presence = model.presence,
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = recipient.title,
                    style = MaterialTheme.typography.bodyLarge,
                    color = MeeshyTheme.tokens.textPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = statusText ?: detail,
                    style = MaterialTheme.typography.labelMedium,
                    color = statusColor(model.status),
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (!model.showsRetry) RowTrailing(model, accentColor)
        }
        if (model.showsRetry) {
            TextButton(onClick = onRetry, modifier = Modifier.heightIn(min = 48.dp).padding(end = MeeshySpacing.sm)) {
                Text(stringResource(R.string.share_status_retry), color = MeeshyPalette.Error)
            }
        }
    }
}

@Composable
private fun statusColor(status: ShareRowStatus?): Color = when (status) {
    ShareRowStatus.SENT -> MeeshyPalette.Success
    ShareRowStatus.FAILED -> MeeshyPalette.Error
    ShareRowStatus.QUEUED -> MeeshyPalette.Warning
    ShareRowStatus.SENDING, null -> MeeshyTheme.tokens.textSecondary
}

/** The line that replaces the detail while a delivery is in flight or over; null when idle. */
@Composable
private fun shareStatusText(model: ShareRecipientRowModel): String? = when (model.status) {
    ShareRowStatus.SENDING -> stringResource(R.string.share_status_sending)
    ShareRowStatus.SENT -> stringResource(R.string.share_status_sent)
    ShareRowStatus.QUEUED -> stringResource(R.string.share_status_queued)
    ShareRowStatus.FAILED -> (model.delivery as? me.meeshy.sdk.model.share.ShareDelivery.Failed)?.let { shareFailureText(it.reason) }
    null -> null
}

@Composable
internal fun shareDetailText(detail: ShareRecipient.Detail): String = when (detail) {
    ShareRecipient.Detail.Direct -> stringResource(R.string.share_detail_direct)
    is ShareRecipient.Detail.Group ->
        if (detail.members > 0) pluralStringResource(R.plurals.chat_forward_members, detail.members, detail.members) else stringResource(R.string.share_detail_group_unsized)
    ShareRecipient.Detail.FriendWithoutConversation -> stringResource(R.string.share_detail_friend)
    is ShareRecipient.Detail.Handle -> "@${detail.handle}"
    is ShareRecipient.Detail.Channel -> stringResource(R.string.share_detail_channel, detail.community)
}

@Composable
private fun RowTrailing(model: ShareRecipientRowModel, accentColor: Color) {
    when (model.status) {
        ShareRowStatus.SENDING -> CircularProgressIndicator(color = accentColor, strokeWidth = 2.dp, modifier = Modifier.size(22.dp))
        ShareRowStatus.SENT -> Icon(MeeshyIcons.CheckCircleFilled, contentDescription = null, tint = MeeshyPalette.Success, modifier = Modifier.size(24.dp))
        ShareRowStatus.QUEUED -> Icon(MeeshyIcons.Schedule, contentDescription = null, tint = MeeshyPalette.Warning, modifier = Modifier.size(24.dp))
        ShareRowStatus.FAILED, null -> Icon(
            imageVector = shareRowMark(model.selected),
            contentDescription = null,
            tint = if (model.selected) accentColor else MeeshyTheme.tokens.textMuted,
            modifier = Modifier.size(24.dp),
        )
    }
}

/** La marque d'une destination (iOS `checkmark.circle.fill` / `circle`) : cochée si choisie, sinon un cercle VIDE. */
internal fun shareRowMark(selected: Boolean): ImageVector = if (selected) MeeshyIcons.CheckCircleFilled else MeeshyIcons.RadioUnchecked
