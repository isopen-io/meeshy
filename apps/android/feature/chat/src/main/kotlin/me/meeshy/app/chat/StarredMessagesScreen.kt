package me.meeshy.app.chat

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
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
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.StarBorder
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.foundation.shape.CircleShape
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
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.component.media.rememberMediaKindStrings
import me.meeshy.sdk.model.StarredAttachmentKind
import me.meeshy.sdk.model.media.MediaKindLabel
import me.meeshy.sdk.model.media.MediaKindStrings
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
    onOpenMessage: (conversationId: String, messageId: String) -> Unit,
    viewModel: StarredMessagesViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var confirmClear by remember { mutableStateOf(false) }
    val mediaStrings = rememberMediaKindStrings()

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
                    actions = {
                        if (!state.isEmpty) StarredMoreMenu(onClearAll = { confirmClear = true })
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
                                mediaStrings = mediaStrings,
                                onOpen = { onOpenMessage(row.message.conversationId, row.message.messageId) },
                                onUnstar = { viewModel.unstar(row.message.messageId) },
                            )
                        }
                    }
                }
            }
        }
    }
    if (confirmClear) {
        ClearAllDialog(
            onConfirm = {
                confirmClear = false
                viewModel.clearAll()
            },
            onDismiss = { confirmClear = false },
        )
    }
}

@Composable
private fun StarredMoreMenu(onClearAll: () -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        IconButton(onClick = { open = true }) {
            MeeshyGlassSurface(shape = CircleShape, modifier = Modifier.size(36.dp)) {
                Icon(
                    Icons.Filled.MoreHoriz,
                    contentDescription = stringResource(R.string.starred_more_options),
                    modifier = Modifier.align(Alignment.Center),
                )
            }
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.starred_remove_all), color = MaterialTheme.colorScheme.error) },
                onClick = {
                    open = false
                    onClearAll()
                },
            )
        }
    }
}

@Composable
private fun ClearAllDialog(onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.starred_clear_confirm_title)) },
        text = { Text(stringResource(R.string.starred_clear_confirm_message)) },
        confirmButton = {
            TextButton(onClick = onConfirm) {
                Text(stringResource(R.string.starred_remove_all), color = MaterialTheme.colorScheme.error)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.chat_delete_confirm_cancel)) }
        },
    )
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun StarredRow(
    row: StarredMessageRow,
    mediaStrings: MediaKindStrings,
    onOpen: () -> Unit,
    onUnstar: () -> Unit,
) {
    val message = row.message
    val name = message.conversationName?.takeIf { it.isNotBlank() } ?: "?"
    val accent = message.rowAccent()
    val preview = starredPreviewLabel(row.snippet, message.senderName, message.attachmentKind, mediaStrings)
    val hint = stringResource(R.string.starred_row_hint)
    val removeLabel = stringResource(R.string.starred_remove)
    var menuOpen by remember { mutableStateOf(false) }
    Box {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .combinedClickable(
                    onClickLabel = hint,
                    onClick = onOpen,
                    onLongClickLabel = removeLabel,
                    onLongClick = { menuOpen = true },
                )
                .semantics(mergeDescendants = true) {
                    customActions = listOf(CustomAccessibilityAction(removeLabel) { onUnstar(); true })
                }
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            MeeshyAvatar(name = name, size = 44.dp, containerColor = accent)
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = preview,
                    style = MaterialTheme.typography.bodyMedium,
                    maxLines = 4,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = name,
                    style = MaterialTheme.typography.labelMedium,
                    color = accent,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Spacer(Modifier.width(12.dp))
            Icon(
                Icons.Filled.Star,
                contentDescription = null,
                tint = MeeshyPalette.Warning,
                modifier = Modifier.size(20.dp),
            )
        }
        DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
            DropdownMenuItem(
                text = { Text(removeLabel, color = MaterialTheme.colorScheme.error) },
                leadingIcon = { Icon(Icons.Outlined.StarBorder, contentDescription = null) },
                onClick = {
                    menuOpen = false
                    onUnstar()
                },
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
private fun starredPreviewLabel(
    snippet: PinnedSnippet,
    sender: String?,
    kind: StarredAttachmentKind?,
    mediaStrings: MediaKindStrings,
): String {
    val body = when {
        snippet is PinnedSnippet.Text -> snippet.value
        kind != null -> MediaKindLabel.summary(kind.toLabelKind(), mediaStrings)
        else -> stringResource(R.string.starred_no_preview)
    }
    val who = sender?.takeIf { it.isNotBlank() }
    return if (who == null) body else "$who: $body"
}

private fun StarredAttachmentKind.toLabelKind(): MediaKindLabel.Kind = when (this) {
    StarredAttachmentKind.IMAGE -> MediaKindLabel.Kind.PHOTO
    StarredAttachmentKind.VIDEO -> MediaKindLabel.Kind.VIDEO
    StarredAttachmentKind.AUDIO -> MediaKindLabel.Kind.AUDIO
    StarredAttachmentKind.FILE -> MediaKindLabel.Kind.FILE
    StarredAttachmentKind.LOCATION -> MediaKindLabel.Kind.LOCATION
}
