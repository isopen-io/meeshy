package me.meeshy.app.chat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.ForwardDurationChoice
import me.meeshy.sdk.model.share.ShareDelivery
import me.meeshy.sdk.model.share.ShareLimits
import me.meeshy.sdk.model.share.ShareTitle
import me.meeshy.sdk.model.share.ShareWithdrawReason
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** The state-changing gestures of the sheet — one place for the caller to wire. */
internal data class ShareSheetActions(
    val onQueryChange: (String) -> Unit,
    val onToggle: (String) -> Unit,
    val onCaptionChange: (String) -> Unit,
    val onDurationChange: (Int) -> Unit,
    val onSend: () -> Unit,
    val onDismiss: () -> Unit,
)

private val FLAME_PRESETS = listOf(30, 60, 300, 3600, 86_400)

/**
 * **L'écran de partage unique** (#13469) — quatre zones, toujours dans cet ordre : ce qui part,
 * ce qu'on peut en faire (légende, durée d'une flamme), à qui, Envoyer. Chemin nominal en deux
 * gestes : toucher un destinataire, puis Envoyer. Le plan ([ForwardUiState.plan]) décide de ce
 * qui est offert ; cette vue ne relit aucun drapeau de protection.
 */
@Composable
internal fun ShareSheet(
    forward: ForwardUiState,
    accentColor: Color,
    actions: ShareSheetActions,
    modifier: Modifier = Modifier,
) {
    if (forward.refusal != null) {
        ForwardRefusalCard(forward.refusal, accentColor, actions.onDismiss, modifier.padding(bottom = MeeshySpacing.lg))
        return
    }
    val plan = forward.plan
    Column(modifier = modifier.fillMaxWidth().padding(bottom = MeeshySpacing.lg)) {
        ShareHeader(plan?.title ?: ShareTitle.FORWARD, actions.onDismiss)
        ShareContentZone(forward)
        if (plan?.caption != null) {
            OutlinedTextField(
                value = forward.caption,
                onValueChange = actions.onCaptionChange,
                placeholder = { Text(stringResource(R.string.share_caption_hint)) },
                maxLines = 3,
                colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = accentColor, cursorColor = accentColor),
                modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
            )
        }
        plan?.flameMaxDurationSeconds?.let { bound ->
            FlameDurationRow(bound, forward.chosenDurationSeconds ?: bound, accentColor, actions.onDurationChange)
        }
        ShareRecipients(forward, accentColor, actions, Modifier.weight(1f, fill = false))
        ShareSendBar(forward, accentColor, actions.onDismiss, actions.onSend)
    }
}

@Composable
private fun ShareHeader(title: ShareTitle, onDismiss: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(start = MeeshySpacing.lg, end = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = stringResource(if (title == ShareTitle.SEND) R.string.share_title_send else R.string.share_title_forward),
            style = MaterialTheme.typography.titleMedium,
            color = MeeshyTheme.tokens.textPrimary,
            modifier = Modifier.weight(1f),
        )
        IconButton(onClick = onDismiss) {
            Icon(MeeshyIcons.Close, contentDescription = stringResource(R.string.share_close), tint = MeeshyTheme.tokens.textSecondary)
        }
    }
}

/** « Ce qui part » : how many messages leave, and why the others stay. */
@Composable
private fun ShareContentZone(forward: ForwardUiState) {
    val plan = forward.plan ?: return
    val total = 1 + forward.additionalSourceMessageIds.size
    Column(Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs)) {
        Text(
            text = if (plan.kept.size < total) {
                stringResource(R.string.share_content_messages_kept, plan.kept.size, total)
            } else {
                stringResource(R.string.share_zone_content)
            },
            style = MaterialTheme.typography.labelMedium,
            color = MeeshyTheme.tokens.textSecondary,
        )
        plan.withdrawn.map { it.reason }.distinct().forEach { reason ->
            Text(
                text = stringResource(
                    when (reason) {
                        ShareWithdrawReason.VIEW_ONCE -> R.string.share_withdrawn_view_once
                        ShareWithdrawReason.AFTER_READ -> R.string.share_withdrawn_after_read
                        ShareWithdrawReason.UNAVAILABLE -> R.string.share_withdrawn_unavailable
                    },
                ),
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textMuted,
            )
        }
    }
}

/** « Disparaît après » : the copy of a timed flame lasts at most as long as its source. */
@Composable
private fun FlameDurationRow(bound: Int, chosen: Int, accentColor: Color, onChange: (Int) -> Unit) {
    val options = (FLAME_PRESETS.filter { it < bound } + bound).distinct()
    Column(Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            Icon(MeeshyIcons.Flame, contentDescription = null, tint = accentColor, modifier = Modifier.size(16.dp))
            Text(stringResource(R.string.share_flame_title), style = MaterialTheme.typography.labelMedium, color = MeeshyTheme.tokens.textSecondary)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            options.forEach { seconds ->
                FilterChip(selected = seconds == chosen, onClick = { onChange(seconds) }, label = { Text(ForwardDurationChoice(seconds).label) })
            }
        }
    }
}

@Composable
private fun ShareRecipients(forward: ForwardUiState, accentColor: Color, actions: ShareSheetActions, modifier: Modifier) {
    Column(modifier) {
        OutlinedTextField(
            value = forward.query,
            onValueChange = actions.onQueryChange,
            singleLine = true,
            leadingIcon = { Icon(MeeshyIcons.Search, contentDescription = null) },
            placeholder = { Text(stringResource(R.string.share_search_hint)) },
            colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = accentColor, cursorColor = accentColor),
            modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
        )
        if (forward.targets.isEmpty()) {
            Column(Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.lg)) {
                Text(stringResource(R.string.share_empty_title), style = MaterialTheme.typography.titleSmall, color = MeeshyTheme.tokens.textPrimary)
                Text(stringResource(R.string.share_empty_body), style = MaterialTheme.typography.bodyMedium, color = MeeshyTheme.tokens.textSecondary)
            }
            return@Column
        }
        Text(
            text = stringResource(R.string.share_section_conversations),
            style = MaterialTheme.typography.labelMedium,
            color = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
        )
        LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 320.dp)) {
            items(forward.targets, key = { it.conversationId }) { target ->
                ShareRecipientRow(
                    target = target,
                    selected = target.conversationId in forward.selectedConversationIds,
                    delivery = forward.deliveries[target.conversationId],
                    accentColor = accentColor,
                    onToggle = { actions.onToggle(target.conversationId) },
                )
            }
        }
    }
}

/** Annuler · Envoyer (N) — armed only when the plan can send; the limits and the fail-closed reasons are told. */
@Composable
private fun ShareSendBar(forward: ForwardUiState, accentColor: Color, onCancel: () -> Unit, onSend: () -> Unit) {
    val plan = forward.plan
    val count = forward.selectedConversationIds.size
    Column(Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm)) {
        if ((plan?.limits?.overRecipients ?: 0) > 0) {
            Text(
                text = stringResource(R.string.share_limits_recipients),
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyPalette.Warning,
            )
        }
        val sentAll = count > 0 && forward.selectedConversationIds.all { forward.deliveries[it] == ShareDelivery.Sent }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
            TextButton(onClick = onCancel) { Text(stringResource(R.string.common_cancel)) }
            Button(
                onClick = if (sentAll) onCancel else onSend,
                enabled = sentAll || plan?.canSend == true,
                colors = ButtonDefaults.buttonColors(containerColor = accentColor),
                modifier = Modifier.weight(1f),
            ) {
                val label = stringResource(if (plan?.title == ShareTitle.SEND) R.string.share_title_send else R.string.share_title_forward)
                Text(if (sentAll) stringResource(R.string.share_status_sent) else if (count > 0) "$label · $count" else label)
            }
        }
    }
}
