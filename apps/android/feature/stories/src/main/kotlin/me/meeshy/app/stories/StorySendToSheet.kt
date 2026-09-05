package me.meeshy.app.stories

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.stories.R
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.hexColor

/**
 * "Send to…" picker for an open story — issue #4816. Parity in spirit with
 * `ChatScreen.ForwardPickerSheet`/`ShareTargetViewModel` (feature/chat), kept
 * as its own small implementation here since feature/stories does not depend
 * on feature/chat. A caption is REQUIRED before any row becomes tappable — the
 * gateway rejects a `storyReplyToId`-only body (`SendMessageBodySchema`
 * refine), so an empty caption cannot silently produce a doomed request.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StorySendToSheet(
    storyId: String,
    accentHex: String,
    onDismiss: () -> Unit,
    viewModel: StorySendToViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(storyId) { viewModel.load(storyId) }

    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .imePadding()
                .navigationBarsPadding()
                .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            Text(
                text = stringResource(R.string.story_send_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = hexColor(accentHex),
            )
            OutlinedTextField(
                value = state.caption,
                onValueChange = viewModel::onCaptionChange,
                placeholder = { Text(stringResource(R.string.story_send_caption_hint)) },
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = state.query,
                onValueChange = viewModel::onQueryChange,
                singleLine = true,
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                placeholder = { Text(stringResource(R.string.story_send_search_hint)) },
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = hexColor(accentHex),
                    cursorColor = hexColor(accentHex),
                ),
                modifier = Modifier.fillMaxWidth(),
            )

            when {
                state.isLoading -> LoadingRow(stringResource(R.string.story_send_loading))
                state.targets.isEmpty() ->
                    CenteredMessage(stringResource(R.string.story_send_empty))
                else -> StorySendTargetList(
                    targets = state.targets,
                    canSend = state.canSend,
                    sendingConversationId = state.sendingConversationId,
                    sentConversationIds = state.sentConversationIds,
                    accentHex = accentHex,
                    onSendTo = viewModel::sendTo,
                )
            }
        }
    }
}

@Composable
private fun StorySendTargetList(
    targets: List<StorySendTarget>,
    canSend: Boolean,
    sendingConversationId: String?,
    sentConversationIds: Set<String>,
    accentHex: String,
    onSendTo: (String) -> Unit,
) {
    LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 420.dp)) {
        items(targets, key = { it.conversationId }) { target ->
            val sent = target.conversationId in sentConversationIds
            val sending = target.conversationId == sendingConversationId
            val enabled = canSend && !sent && sendingConversationId == null
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(enabled = enabled) { onSendTo(target.conversationId) }
                    .alpha(if (canSend) 1f else 0.5f)
                    .padding(vertical = MeeshySpacing.sm),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            ) {
                MeeshyAvatar(
                    name = target.title,
                    size = 40.dp,
                    containerColor = hexColor(target.accentHex).takeIf { it != Color.Unspecified }
                        ?: hexColor(accentHex),
                )
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = target.title,
                        style = MaterialTheme.typography.bodyLarge,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    if (target.memberCount > 0) {
                        Text(
                            text = stringResource(R.string.story_send_members, target.memberCount),
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
                when {
                    sent -> Icon(
                        imageVector = Icons.Filled.Check,
                        contentDescription = stringResource(R.string.story_send_sent),
                        tint = MeeshyPalette.Success,
                        modifier = Modifier.size(24.dp),
                    )
                    sending -> CircularProgressIndicator(
                        color = hexColor(accentHex),
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(22.dp),
                    )
                    else -> Icon(
                        imageVector = Icons.AutoMirrored.Filled.Send,
                        contentDescription = stringResource(R.string.story_send_send_a11y, target.title),
                        tint = hexColor(accentHex),
                        modifier = Modifier.size(24.dp),
                    )
                }
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
        }
    }
}

@Composable
private fun LoadingRow(message: String) {
    Box(
        modifier = Modifier.fillMaxWidth().padding(vertical = MeeshySpacing.lg),
        contentAlignment = Alignment.Center,
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            CircularProgressIndicator(modifier = Modifier.padding(end = MeeshySpacing.xs))
            Text(text = message, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
private fun CenteredMessage(message: String) {
    Box(
        modifier = Modifier.fillMaxWidth().padding(vertical = MeeshySpacing.lg),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}
