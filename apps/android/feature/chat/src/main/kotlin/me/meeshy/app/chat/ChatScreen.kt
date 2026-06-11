package me.meeshy.app.chat

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.flow.distinctUntilChanged
import me.meeshy.feature.chat.R
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.DeliveryStatus
import me.meeshy.ui.component.bubble.MessageBubble
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    onBack: () -> Unit,
    viewModel: ChatViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val listState = rememberLazyListState()

    LaunchedEffect(state.messages.lastOrNull()?.messageId) {
        if (state.messages.isNotEmpty()) {
            listState.animateScrollToItem(state.messages.lastIndex)
        }
    }

    LaunchedEffect(listState) {
        snapshotFlow { listState.firstVisibleItemIndex }
            .distinctUntilChanged()
            .collect { index ->
                if (index <= LOAD_OLDER_THRESHOLD) viewModel.loadOlder()
            }
    }

    val accentColor = state.accentColorHex
        ?.let { hexColor(it) }
        ?.takeIf { it != Color.Unspecified }
        ?: MeeshyPalette.Indigo500

    Scaffold(
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(10.dp)
                                .clip(CircleShape)
                                .background(accentColor),
                        )
                        Text(
                            text = state.conversationTitle ?: stringResource(R.string.chat_title),
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.padding(start = MeeshySpacing.sm),
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.chat_back))
                    }
                },
            )
        },
        bottomBar = {
            ChatComposer(
                draft = state.draft,
                canSend = state.canSend,
                isEditing = state.isEditing,
                onDraftChange = viewModel::onDraftChange,
                onSend = viewModel::send,
                onCancelEdit = viewModel::cancelEdit,
            )
        },
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding)) {
            when {
                state.showSkeleton -> ChatSkeleton()

                state.messages.isEmpty() && state.errorMessage != null ->
                    ChatNotice(state.errorMessage!!, onRetry = viewModel::refresh)

                state.messages.isEmpty() ->
                    ChatNotice(stringResource(R.string.chat_no_messages), onRetry = null)

                else -> Column(modifier = Modifier.fillMaxSize()) {
                    LazyColumn(
                        state = listState,
                        modifier = Modifier.weight(1f),
                        contentPadding = PaddingValues(vertical = MeeshySpacing.sm),
                    ) {
                        if (state.isLoadingOlder) {
                            item(key = "loading-older") {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(vertical = MeeshySpacing.sm),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(20.dp),
                                        strokeWidth = 2.dp,
                                        color = accentColor,
                                    )
                                }
                            }
                        }
                        items(state.messages, key = { it.messageId }) { bubble ->
                            MessageBubble(
                                content = bubble,
                                outgoingColor = accentColor,
                                onLongPress = { viewModel.onMessageLongPress(bubble.messageId) },
                                onReactionClick = { emoji ->
                                    viewModel.toggleReaction(bubble.messageId, emoji)
                                },
                            )
                            if (bubble.deliveryStatus == DeliveryStatus.Failed) {
                                Text(
                                    text = stringResource(R.string.chat_send_failed_retry),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.error,
                                    textAlign = TextAlign.End,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable { viewModel.retryMessage(bubble.messageId) }
                                        .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
                                )
                            }
                        }
                    }
                    TypingIndicator(typingUsers = state.typingUsers)
                }
            }
        }
    }

    val actionTarget = state.actionMessageId?.let { id ->
        state.messages.firstOrNull { it.messageId == id }
    }
    if (actionTarget != null) {
        MessageActionsSheet(
            bubble = actionTarget,
            ownReactions = state.ownReactions[actionTarget.messageId] ?: emptySet(),
            onReact = { emoji -> viewModel.toggleReaction(actionTarget.messageId, emoji) },
            onEdit = { viewModel.startEdit(actionTarget.messageId) },
            onDelete = { viewModel.deleteMessage(actionTarget.messageId) },
            onDismiss = viewModel::dismissMessageActions,
        )
    }
}

private const val LOAD_OLDER_THRESHOLD = 2

private val QuickReactions = listOf("❤️", "😂", "🔥", "👏", "😮", "😢", "🥰", "👍")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MessageActionsSheet(
    bubble: BubbleContent,
    ownReactions: Set<String>,
    onReact: (String) -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    onDismiss: () -> Unit,
) {
    val clipboard = LocalClipboardManager.current
    val isActionable = !bubble.isDeleted &&
        !bubble.isPending &&
        bubble.deliveryStatus != DeliveryStatus.Failed
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
    ) {
        Column(modifier = Modifier.padding(bottom = MeeshySpacing.xl)) {
            if (isActionable) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
                    horizontalArrangement = Arrangement.SpaceEvenly,
                ) {
                    QuickReactions.forEach { emoji ->
                        QuickReactionButton(
                            emoji = emoji,
                            isMine = emoji in ownReactions,
                            onClick = { onReact(emoji) },
                        )
                    }
                }
                HorizontalDivider(color = MeeshyTheme.tokens.backgroundTertiary)
            }

            if (!bubble.isDeleted) {
                SheetAction(
                    icon = Icons.Filled.ContentCopy,
                    label = stringResource(R.string.chat_action_copy),
                    onClick = {
                        clipboard.setText(AnnotatedString(bubble.text))
                        onDismiss()
                    },
                )
            }
            if (bubble.isOutgoing && isActionable) {
                SheetAction(
                    icon = Icons.Filled.Edit,
                    label = stringResource(R.string.chat_action_edit),
                    onClick = onEdit,
                )
                SheetAction(
                    icon = Icons.Filled.Delete,
                    label = stringResource(R.string.chat_action_delete),
                    tint = MaterialTheme.colorScheme.error,
                    onClick = onDelete,
                )
            }
        }
    }
}

@Composable
private fun QuickReactionButton(emoji: String, isMine: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(44.dp)
            .clip(CircleShape)
            .background(
                if (isMine) MeeshyPalette.Indigo500.copy(alpha = 0.22f) else Color.Transparent,
            )
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        val description = stringResource(R.string.chat_react_with, emoji)
        Text(
            text = emoji,
            fontSize = 22.sp,
            modifier = Modifier.semantics { contentDescription = description },
        )
    }
}

@Composable
private fun SheetAction(
    icon: ImageVector,
    label: String,
    onClick: () -> Unit,
    tint: Color = MeeshyTheme.tokens.textPrimary,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Icon(imageVector = icon, contentDescription = null, tint = tint, modifier = Modifier.size(22.dp))
        Text(text = label, style = MaterialTheme.typography.bodyLarge, color = tint)
    }
}

@Composable
private fun TypingIndicator(typingUsers: List<String>, modifier: Modifier = Modifier) {
    if (typingUsers.isEmpty()) return
    val text = when (typingUsers.size) {
        1 -> "${typingUsers[0]} is typing..."
        2 -> "${typingUsers[0]} and ${typingUsers[1]} are typing..."
        else -> "${typingUsers.size} people are typing..."
    }
    Text(
        text = text,
        style = MaterialTheme.typography.labelSmall,
        color = MeeshyTheme.tokens.textSecondary,
        modifier = modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ChatComposer(
    draft: String,
    canSend: Boolean,
    isEditing: Boolean,
    onDraftChange: (String) -> Unit,
    onSend: () -> Unit,
    onCancelEdit: () -> Unit,
) {
    Surface(color = MeeshyTheme.tokens.backgroundPrimary) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .imePadding(),
        ) {
            if (isEditing) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(start = MeeshySpacing.lg, end = MeeshySpacing.sm),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = Icons.Filled.Edit,
                        contentDescription = null,
                        tint = MeeshyPalette.Indigo400,
                        modifier = Modifier.size(16.dp),
                    )
                    Text(
                        text = stringResource(R.string.chat_editing_label),
                        style = MaterialTheme.typography.labelMedium,
                        color = MeeshyPalette.Indigo400,
                        modifier = Modifier
                            .weight(1f)
                            .padding(start = MeeshySpacing.xs),
                    )
                    IconButton(onClick = onCancelEdit) {
                        Icon(
                            imageVector = Icons.Filled.Close,
                            contentDescription = stringResource(R.string.chat_cancel_edit),
                            tint = MeeshyTheme.tokens.textSecondary,
                            modifier = Modifier.size(18.dp),
                        )
                    }
                }
            }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                OutlinedTextField(
                    value = draft,
                    onValueChange = onDraftChange,
                    modifier = Modifier.weight(1f),
                    placeholder = { Text(stringResource(R.string.chat_message_placeholder)) },
                    maxLines = 4,
                )
                IconButton(onClick = onSend, enabled = canSend) {
                    Icon(
                        imageVector = if (isEditing) Icons.Filled.Check else Icons.AutoMirrored.Filled.Send,
                        contentDescription = stringResource(R.string.chat_send),
                    )
                }
            }
        }
    }
}

@Composable
private fun ChatSkeleton() {
    Column(modifier = Modifier.fillMaxSize().padding(MeeshySpacing.lg)) {
        repeat(6) { index ->
            MeeshySkeletonBox(
                modifier = Modifier
                    .padding(vertical = MeeshySpacing.sm)
                    .fillMaxWidth(if (index % 2 == 0) 0.6f else 0.45f)
                    .height(36.dp),
            )
        }
    }
}

@Composable
private fun ChatNotice(message: String, onRetry: (() -> Unit)?) {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textSecondary,
        )
        if (onRetry != null) {
            Button(onClick = onRetry, modifier = Modifier.padding(top = MeeshySpacing.lg)) {
                Text(stringResource(R.string.chat_retry))
            }
        }
    }
}
