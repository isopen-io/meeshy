package me.meeshy.app.chat

import android.text.format.DateUtils
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.thread.ThreadReply
import me.meeshy.sdk.model.thread.ThreadReplyStatus
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

/** Le message parent, tel que le fil le présente en carte teintée (instantané immuable, jamais un flux). */
@Stable
data class ReplyThreadParent(
    val messageId: String,
    val senderName: String?,
    val senderAvatarUrl: String?,
    val senderColorHex: String?,
    val text: String,
    val createdAtMillis: Long?,
)

/**
 * Le fil de discussion d'un message en plein écran (iOS `ThreadView`) : parent en carte teintée, « N réponses »,
 * réponses du serveur cache-first, composeur de réponse. L'accent arrive en paramètre.
 */
@Composable
internal fun ReplyThreadScreen(
    conversationId: String,
    parent: ReplyThreadParent,
    accentColor: Color,
    canReply: Boolean,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: ReplyThreadViewModel = hiltViewModel(key = "reply-thread-${parent.messageId}"),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val listState = rememberLazyListState()
    LaunchedEffect(conversationId, parent.messageId, canReply) {
        viewModel.onEvent(ReplyThreadUiEvent.Open(conversationId, parent.messageId, canReply))
    }
    LaunchedEffect(viewModel) {
        viewModel.effects.collect { effect ->
            when (effect) {
                ReplyThreadUiEffect.ScrollToEnd -> listState.animateScrollToItem((listState.layoutInfo.totalItemsCount - 1).coerceAtLeast(0))
            }
        }
    }
    ReplyThreadContent(
        state = state,
        parent = parent,
        accentColor = accentColor,
        listState = listState,
        onEvent = viewModel::onEvent,
        onDismiss = onDismiss,
        modifier = modifier,
    )
}

@Composable
private fun ReplyThreadContent(
    state: ReplyThreadUiState,
    parent: ReplyThreadParent,
    accentColor: Color,
    listState: LazyListState,
    onEvent: (ReplyThreadUiEvent) -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = MeeshyTheme.tokens
    Column(
        modifier = modifier
            .fillMaxSize()
            .background(tokens.backgroundPrimary)
            .statusBarsPadding()
            .navigationBarsPadding()
            .imePadding(),
    ) {
        ThreadHeader(count = state.replies.size, accentColor = accentColor, onBack = onDismiss)
        LazyColumn(
            state = listState,
            modifier = Modifier.weight(1f).fillMaxWidth(),
            contentPadding = PaddingValues(
                horizontal = MeeshySpacing.lg,
                vertical = MeeshySpacing.sm,
            ),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
        ) {
            item(key = "parent", contentType = "parent") { ParentCard(parent, accentColor) }
            item(key = "divider", contentType = "divider") { RepliesDivider(state.replies.size, accentColor) }
            if (state.isLoading) {
                items(SKELETON_ROWS, key = { "sk-$it" }, contentType = { "skeleton" }) { SkeletonRow() }
            }
            items(state.replies, key = { it.id }, contentType = { "reply" }) { reply ->
                ReplyRow(reply, accentColor)
            }
            if (state.isOffline) {
                item(key = "offline", contentType = "notice") {
                    Text(
                        text = stringResource(R.string.chat_history_offline),
                        style = MaterialTheme.typography.labelMedium,
                        color = tokens.textMuted,
                    )
                }
            }
            if (state.hasMore) {
                item(key = "more", contentType = "more") {
                    LaunchedEffect(state.replies.size) { onEvent(ReplyThreadUiEvent.LoadMore) }
                    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp, color = accentColor)
                    }
                }
            }
        }
        if (state.canReply) {
            ReplyComposer(state = state, accentColor = accentColor, onEvent = onEvent)
        }
    }
}

@Composable
private fun ThreadHeader(count: Int, accentColor: Color, onBack: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onBack, modifier = Modifier.size(48.dp)) {
            Icon(
                imageVector = MeeshyIcons.Back,
                contentDescription = stringResource(R.string.chat_back),
                tint = accentColor,
            )
        }
        Text(
            text = stringResource(R.string.chat_thread_discussion_title),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            color = MeeshyTheme.tokens.textPrimary,
            modifier = Modifier.weight(1f).semantics { heading() },
        )
        Text(
            text = pluralStringResource(R.plurals.chat_reply_count, count, count),
            style = MaterialTheme.typography.labelMedium,
            color = MeeshyTheme.tokens.textMuted,
            modifier = Modifier.padding(end = MeeshySpacing.md),
        )
    }
}

@Composable
private fun ParentCard(parent: ReplyThreadParent, accentColor: Color) {
    val tokens = MeeshyTheme.tokens
    val shape = RoundedCornerShape(MeeshyRadius.md)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(accentColor.copy(alpha = 0.10f))
            .border(BorderStroke(1.dp, accentColor.copy(alpha = 0.30f)), shape)
            .padding(MeeshySpacing.mdPlus)
            .semantics(mergeDescendants = true) {},
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
            Avatar(parent.senderName, parent.senderAvatarUrl, parent.senderColorHex, accentColor, 40.dp)
            Column {
                Text(
                    text = parent.senderName.orEmpty(),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = tokens.textPrimary,
                )
                parent.createdAtMillis?.let { RelativeTime(it) }
            }
        }
        Text(text = parent.text, style = MaterialTheme.typography.bodyMedium, color = tokens.textPrimary)
    }
}

@Composable
private fun RepliesDivider(count: Int, accentColor: Color) {
    Row(
        modifier = Modifier.fillMaxWidth().semantics(mergeDescendants = true) { heading() },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        HorizontalDivider(Modifier.weight(1f), color = accentColor.copy(alpha = 0.4f))
        Text(
            text = pluralStringResource(R.plurals.chat_reply_count, count, count),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            color = accentColor,
            modifier = Modifier.padding(horizontal = MeeshySpacing.sm),
        )
        HorizontalDivider(Modifier.weight(1f), color = accentColor.copy(alpha = 0.4f))
    }
}

@Composable
private fun ReplyRow(reply: ThreadReply, accentColor: Color) {
    val tokens = MeeshyTheme.tokens
    val authorColor = reply.senderName?.let { hexColor(DynamicColorGenerator.colorForName(it), accentColor) } ?: accentColor
    val sending = reply.status == ThreadReplyStatus.SENDING
    val sendingLabel = stringResource(R.string.chat_thread_sending)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .alpha(if (sending) 0.6f else 1f)
            .semantics(mergeDescendants = true) { if (sending) stateDescription = sendingLabel },
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus),
    ) {
        Avatar(reply.senderName, reply.senderAvatarUrl, null, accentColor, 32.dp)
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
            Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = reply.senderName.orEmpty(),
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = authorColor,
                )
                if (sending) {
                    Text(text = sendingLabel, style = MaterialTheme.typography.labelSmall, color = tokens.textMuted)
                } else {
                    RelativeTime(reply.createdAtMillis)
                }
            }
            Text(text = reply.text, style = MaterialTheme.typography.bodyMedium, color = tokens.textPrimary)
            if (reply.status == ThreadReplyStatus.FAILED) {
                Text(
                    text = stringResource(R.string.chat_thread_send_error),
                    style = MaterialTheme.typography.labelSmall,
                    color = tokens.errorInk,
                )
            }
        }
    }
}

@Composable
private fun SkeletonRow() {
    Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus)) {
        MeeshySkeletonBox(Modifier.size(32.dp), CircleShape)
        Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            MeeshySkeletonBox(Modifier.width(96.dp).height(12.dp))
            MeeshySkeletonBox(Modifier.fillMaxWidth(0.8f).height(14.dp))
        }
    }
}

@Composable
private fun Avatar(name: String?, url: String?, colorHex: String?, fallback: Color, size: androidx.compose.ui.unit.Dp) {
    val display = name?.takeIf { it.isNotBlank() } ?: "?"
    val container = colorHex?.let { hexColor(it, fallback) }
        ?: name?.let { hexColor(DynamicColorGenerator.colorForName(it), fallback) }
        ?: fallback
    MeeshyAvatar(name = display, size = size, containerColor = container, imageUrl = url)
}

@Composable
private fun RelativeTime(millis: Long) {
    if (millis <= 0L) return
    val text = remember(millis) {
        DateUtils.getRelativeTimeSpanString(millis, System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS).toString()
    }
    Text(text = text, style = MaterialTheme.typography.labelSmall, color = MeeshyTheme.tokens.textMuted)
}

@Composable
private fun ReplyComposer(state: ReplyThreadUiState, accentColor: Color, onEvent: (ReplyThreadUiEvent) -> Unit) {
    val tokens = MeeshyTheme.tokens
    val sendLabel = stringResource(R.string.chat_thread_send_label)
    Column(
        modifier = Modifier.fillMaxWidth().background(tokens.backgroundSecondary).padding(vertical = MeeshySpacing.smPlus),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        if (state.sendFailed) {
            Text(
                text = stringResource(R.string.chat_thread_send_error),
                style = MaterialTheme.typography.labelSmall,
                color = tokens.errorInk,
                modifier = Modifier.padding(horizontal = MeeshySpacing.lg).semantics(mergeDescendants = true) {},
            )
        }
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus),
        ) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .defaultMinSize(minHeight = 44.dp)
                    .clip(CircleShape)
                    .background(tokens.inputBackground)
                    .border(BorderStroke(1.dp, accentColor.copy(alpha = 0.3f)), CircleShape)
                    .padding(horizontal = MeeshySpacing.mdPlus, vertical = MeeshySpacing.smPlus),
                contentAlignment = Alignment.CenterStart,
            ) {
                if (state.draft.isEmpty()) {
                    Text(
                        text = stringResource(R.string.chat_thread_reply_placeholder),
                        style = MaterialTheme.typography.bodyMedium,
                        color = tokens.textMuted,
                    )
                }
                BasicTextField(
                    value = state.draft,
                    onValueChange = { onEvent(ReplyThreadUiEvent.DraftChanged(it)) },
                    enabled = !state.isSending,
                    textStyle = MaterialTheme.typography.bodyMedium.copy(color = tokens.textPrimary),
                    cursorBrush = SolidColor(accentColor),
                    maxLines = 4,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                    keyboardActions = KeyboardActions(onSend = { onEvent(ReplyThreadUiEvent.Send) }),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            IconButton(
                onClick = { onEvent(ReplyThreadUiEvent.Send) },
                enabled = state.canSend,
                modifier = Modifier.size(48.dp),
            ) {
                if (state.isSending) {
                    CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp, color = accentColor)
                } else {
                    Icon(
                        imageVector = MeeshyIcons.Send,
                        contentDescription = sendLabel,
                        tint = if (state.canSend) accentColor else tokens.textMuted,
                    )
                }
            }
        }
    }
}

private const val SKELETON_ROWS = 3
