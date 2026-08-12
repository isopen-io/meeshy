package me.meeshy.app.chat

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.StarBorder
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.StarredMessage
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

/**
 * The starred-messages list — every message the user has bookmarked, newest-star
 * first (parity with iOS `StarredMessagesView`). Reachable from Settings; a row taps
 * back into its conversation, the trailing star removes the bookmark in place. Pure
 * ordering + preview projection lives in [StarredMessagesUiState]; this is exempt
 * Compose glue.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StarredMessagesScreen(
    onBack: () -> Unit,
    onOpenConversation: (String) -> Unit,
    viewModel: StarredMessagesViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    MeeshyBackground {
        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                TopAppBar(
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = Color.Transparent,
                        scrolledContainerColor = Color.Transparent,
                        titleContentColor = MeeshyTheme.tokens.textPrimary,
                        navigationIconContentColor = MeeshyTheme.tokens.textPrimary,
                    ),
                    title = { Text(stringResource(R.string.starred_title)) },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(
                                Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = stringResource(R.string.starred_back),
                            )
                        }
                    },
                )
            },
        ) { padding ->
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
            ) {
                if (state.isEmpty) {
                    StarredEmptyState()
                } else {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(vertical = 8.dp),
                    ) {
                        items(state.rows, key = { it.message.messageId }) { row ->
                            StarredRow(
                                row = row,
                                onOpen = { onOpenConversation(row.message.conversationId) },
                                onUnstar = { viewModel.unstar(row.message.messageId) },
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun StarredRow(
    row: StarredMessageRow,
    onOpen: () -> Unit,
    onUnstar: () -> Unit,
) {
    val message = row.message
    val name = message.conversationName?.takeIf { it.isNotBlank() } ?: "?"
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onOpen)
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        MeeshyAvatar(
            name = name,
            size = 44.dp,
            containerColor = message.rowAccent(),
        )
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = name,
                style = MaterialTheme.typography.bodyLarge,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = starredPreviewLabel(row.snippet, message.senderName),
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textSecondary,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.width(12.dp))
        IconButton(onClick = onUnstar) {
            Icon(
                Icons.Filled.Star,
                contentDescription = stringResource(R.string.chat_action_unstar),
                tint = MeeshyPalette.Warning,
            )
        }
    }
}

@Composable
private fun StarredEmptyState() {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.padding(32.dp),
        ) {
            Icon(
                Icons.Outlined.StarBorder,
                contentDescription = null,
                tint = MeeshyTheme.tokens.textSecondary,
                modifier = Modifier.size(48.dp),
            )
            Text(
                text = stringResource(R.string.starred_empty_title),
                style = MaterialTheme.typography.titleMedium,
                color = MeeshyTheme.tokens.textPrimary,
            )
            Text(
                text = stringResource(R.string.starred_empty_hint),
                style = MaterialTheme.typography.bodyMedium,
                color = MeeshyTheme.tokens.textSecondary,
            )
        }
    }
}

/**
 * Accent-coherent avatar tint: the conversation's own deterministic accent when the
 * snapshot carries one, else the shared name→palette fallback (parity with the
 * conversation list / chat header).
 */
private fun StarredMessage.rowAccent(): Color {
    val fromSnapshot = conversationAccentColor?.let(::hexColor)?.takeIf { it != Color.Unspecified }
    return fromSnapshot
        ?: hexColor(DynamicColorGenerator.colorForName(conversationId.ifBlank { conversationName.orEmpty() }))
}

@Composable
private fun starredPreviewLabel(snippet: PinnedSnippet, sender: String?): String {
    val body = when (snippet) {
        is PinnedSnippet.Text -> snippet.value
        PinnedSnippet.Image -> stringResource(R.string.chat_unread_photo)
        PinnedSnippet.File -> stringResource(R.string.chat_unread_attachment)
        PinnedSnippet.Empty -> stringResource(R.string.starred_no_preview)
    }
    val who = sender?.takeIf { it.isNotBlank() }
    return if (who == null) body else "$who: $body"
}
