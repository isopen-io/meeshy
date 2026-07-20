package me.meeshy.app.stories

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.clickable
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.StoryComment
import me.meeshy.sdk.model.StoryCommentStatus
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.hexColor

/**
 * Comments overlay for an open story — parity with iOS `StoryCommentsView`, with
 * Instant-App discipline (cold-only spinner, stale-kept refresh) and optimistic
 * posting: a comment appears instantly, dims while sending, and offers a tap-to-
 * retry when it fails. The accent colour ties the sheet to the open story.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StoryCommentsSheet(
    storyId: String,
    accentHex: String,
    onDismiss: () -> Unit,
    viewModel: StoryCommentsViewModel = hiltViewModel(),
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
                text = if (state.comments.isEmpty()) {
                    stringResource(R.string.stories_comments_title)
                } else {
                    stringResource(R.string.stories_comments_count, state.comments.size)
                },
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = hexColor(accentHex),
            )

            when {
                state.isLoading -> LoadingRow(stringResource(R.string.stories_comments_loading))
                state.errorMessage != null ->
                    CenteredMessage(stringResource(R.string.stories_comments_error))
                state.isEmpty -> EmptyComments()
                else -> CommentList(state.comments, onRetry = viewModel::retry)
            }

            CommentInput(accentHex = accentHex, onSend = viewModel::post)
        }
    }
}

@Composable
private fun CommentList(comments: List<StoryComment>, onRetry: (String) -> Unit) {
    LazyColumn(
        modifier = Modifier.heightIn(max = 420.dp),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        items(comments, key = { it.id }) { comment ->
            CommentRow(comment, onRetry)
        }
    }
}

@Composable
private fun CommentRow(comment: StoryComment, onRetry: (String) -> Unit) {
    val isPending = comment.status == StoryCommentStatus.Pending
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .alpha(if (isPending) 0.6f else 1f),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        MeeshyAvatar(
            name = comment.authorName,
            size = 36.dp,
            containerColor = hexColor(DynamicColorGenerator.colorForName(comment.authorName)),
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = comment.authorName,
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold,
            )
            Text(text = comment.content, style = MaterialTheme.typography.bodyMedium)
            val failedClientId = comment.clientId
            if (comment.status == StoryCommentStatus.Failed && failedClientId != null) {
                Text(
                    text = stringResource(R.string.stories_comments_failed),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.clickableRetry { onRetry(failedClientId) },
                )
            }
        }
    }
}

private fun Modifier.clickableRetry(onClick: () -> Unit): Modifier =
    this.clickable(onClick = onClick)

@Composable
private fun CommentInput(accentHex: String, onSend: (String) -> Unit) {
    var draft by remember { mutableStateOf("") }
    val canSend = draft.isNotBlank()
    fun submit() {
        if (!canSend) return
        onSend(draft)
        draft = ""
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        OutlinedTextField(
            value = draft,
            onValueChange = { draft = it },
            modifier = Modifier.weight(1f),
            placeholder = { Text(stringResource(R.string.stories_comments_input_hint)) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
            keyboardActions = KeyboardActions(onSend = { submit() }),
        )
        IconButton(onClick = ::submit, enabled = canSend) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.Send,
                contentDescription = stringResource(R.string.stories_comments_send),
                tint = hexColor(accentHex),
            )
        }
    }
}

@Composable
private fun EmptyComments() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = MeeshySpacing.lg),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Text(
            text = stringResource(R.string.stories_comments_empty_title),
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.Center,
        )
        Text(
            text = stringResource(R.string.stories_comments_empty_subtitle),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun LoadingRow(message: String) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = MeeshySpacing.lg),
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
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = MeeshySpacing.lg),
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