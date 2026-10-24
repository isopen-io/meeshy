package me.meeshy.app.chat

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ForwardPickerSheet(
    forward: ForwardUiState,
    accentColor: Color,
    onQueryChange: (String) -> Unit,
    onForwardTo: (String) -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (forward.refusal != null) {
        ForwardRefusalCard(forward.refusal, accentColor, onDismiss, modifier.padding(bottom = MeeshySpacing.lg))
        return
    }
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(bottom = MeeshySpacing.lg),
    ) {
        Text(
            text = stringResource(R.string.chat_forward_title),
            style = MaterialTheme.typography.titleMedium,
            color = MeeshyTheme.tokens.textPrimary,
            modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
        )
        OutlinedTextField(
            value = forward.query,
            onValueChange = onQueryChange,
            singleLine = true,
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
            placeholder = { Text(stringResource(R.string.chat_forward_search_hint)) },
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = accentColor,
                cursorColor = accentColor,
            ),
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
        )
        if (forward.targets.isEmpty()) {
            Text(
                text = stringResource(R.string.chat_forward_empty),
                style = MaterialTheme.typography.bodyMedium,
                color = MeeshyTheme.tokens.textSecondary,
                modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.lg),
            )
            return@Column
        }
        LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 420.dp)) {
            itemsIndexed(forward.targets, key = { _, t -> t.conversationId }) { index, target ->
                if (index > 0) {
                    HorizontalDivider(
                        modifier = Modifier.padding(horizontal = MeeshySpacing.lg),
                        color = MeeshyTheme.tokens.backgroundTertiary.copy(alpha = 0.5f),
                    )
                }
                val sent = target.conversationId in forward.sentConversationIds
                val sending = target.conversationId == forward.sendingConversationId
                val enabled = !sent && forward.sendingConversationId == null
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable(enabled = enabled) { onForwardTo(target.conversationId) }
                        .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
                ) {
                    MeeshyAvatar(
                        name = target.title,
                        size = 40.dp,
                        containerColor = hexColor(target.accentHex).takeIf { it != Color.Unspecified } ?: accentColor,
                        imageUrl = target.avatar,
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
                            text = if (target.memberCount > 0) {
                                stringResource(R.string.chat_forward_members, target.memberCount)
                            } else {
                                target.type
                            },
                            style = MaterialTheme.typography.labelMedium,
                            color = MeeshyTheme.tokens.textSecondary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    when {
                        sent -> Icon(
                            imageVector = Icons.Filled.Check,
                            contentDescription = stringResource(R.string.chat_forward_sent),
                            tint = MeeshyPalette.Success,
                            modifier = Modifier.size(24.dp),
                        )
                        sending -> CircularProgressIndicator(
                            color = accentColor,
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(22.dp),
                        )
                        else -> Icon(
                            imageVector = Icons.AutoMirrored.Filled.Send,
                            contentDescription = stringResource(R.string.chat_forward_send_a11y, target.title),
                            tint = accentColor,
                            modifier = Modifier.size(24.dp),
                        )
                    }
                }
            }
        }
    }
}
