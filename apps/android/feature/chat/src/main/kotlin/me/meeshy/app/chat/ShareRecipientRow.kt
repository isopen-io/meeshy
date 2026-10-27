package me.meeshy.app.chat

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.share.ShareDelivery
import me.meeshy.sdk.model.share.ShareFailure
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.rememberPresence
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

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
 * One recipient row of the share sheet: avatar with the served presence (friends only, nothing
 * fabricated), name, detail, and the delivery state — ticked, sending, sent, or failed with retry.
 */
@Composable
internal fun ShareRecipientRow(
    target: ForwardTarget,
    selected: Boolean,
    delivery: ShareDelivery?,
    accentColor: Color,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val served = delivery != null && delivery !is ShareDelivery.Failed
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clickable(enabled = !served, onClick = onToggle)
            .semantics { role = Role.Checkbox; this.selected = selected }
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        MeeshyAvatar(
            name = target.title,
            size = 40.dp,
            containerColor = hexColor(target.accentHex).takeIf { it != Color.Unspecified } ?: accentColor,
            imageUrl = target.avatar,
            presence = rememberPresence(target.peerUserId),
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = target.title,
                style = MaterialTheme.typography.bodyLarge,
                color = MeeshyTheme.tokens.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = rowDetail(target, delivery),
                style = MaterialTheme.typography.labelMedium,
                color = if (delivery is ShareDelivery.Failed) MeeshyPalette.Error else MeeshyTheme.tokens.textSecondary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        RowTrailing(selected, delivery, accentColor)
    }
}

@Composable
private fun rowDetail(target: ForwardTarget, delivery: ShareDelivery?): String = when (delivery) {
    ShareDelivery.Sending -> stringResource(R.string.share_status_sending)
    ShareDelivery.Sent -> stringResource(R.string.share_status_sent)
    ShareDelivery.Queued -> stringResource(R.string.share_status_queued)
    is ShareDelivery.Failed -> "${shareFailureText(delivery.reason)} · ${stringResource(R.string.share_status_retry)}"
    null -> when {
        target.isDirect -> stringResource(R.string.share_detail_direct)
        target.memberCount > 0 -> stringResource(R.string.chat_forward_members, target.memberCount)
        else -> stringResource(R.string.share_detail_group_unsized)
    }
}

@Composable
private fun RowTrailing(selected: Boolean, delivery: ShareDelivery?, accentColor: Color) {
    when {
        delivery == ShareDelivery.Sending -> CircularProgressIndicator(color = accentColor, strokeWidth = 2.dp, modifier = Modifier.size(22.dp))
        delivery == ShareDelivery.Sent || delivery == ShareDelivery.Queued -> Icon(
            imageVector = MeeshyIcons.CheckCircleFilled,
            contentDescription = stringResource(R.string.share_status_sent),
            tint = MeeshyPalette.Success,
            modifier = Modifier.size(24.dp),
        )
        delivery is ShareDelivery.Failed -> Icon(MeeshyIcons.Refresh, contentDescription = stringResource(R.string.share_status_retry), tint = MeeshyPalette.Error, modifier = Modifier.size(24.dp))
        selected -> Icon(MeeshyIcons.CheckCircleFilled, contentDescription = null, tint = accentColor, modifier = Modifier.size(24.dp))
        else -> Icon(MeeshyIcons.CheckCircle, contentDescription = null, tint = MeeshyTheme.tokens.textMuted, modifier = Modifier.size(24.dp))
    }
}
