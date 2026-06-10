package me.meeshy.app.chat

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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.chat.R
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.component.bubble.MessageBubble
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    onBack: () -> Unit,
    viewModel: ChatViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val listState = rememberLazyListState()

    LaunchedEffect(state.messages.size) {
        if (state.messages.isNotEmpty()) {
            listState.animateScrollToItem(state.messages.lastIndex)
        }
    }

    Scaffold(
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.chat_title), fontWeight = FontWeight.Bold) },
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
                onDraftChange = viewModel::onDraftChange,
                onSend = viewModel::send,
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
                        items(state.messages, key = { it.messageId }) { bubble ->
                            MessageBubble(bubble)
                        }
                    }
                    TypingIndicator(typingUsers = state.typingUsers)
                }
            }
        }
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
    onDraftChange: (String) -> Unit,
    onSend: () -> Unit,
) {
    Surface(color = MeeshyTheme.tokens.backgroundPrimary) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .imePadding()
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
                Icon(Icons.AutoMirrored.Filled.Send, contentDescription = stringResource(R.string.chat_send))
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
