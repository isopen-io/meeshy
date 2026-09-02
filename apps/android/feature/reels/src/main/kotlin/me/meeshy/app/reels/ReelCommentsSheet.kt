package me.meeshy.app.reels

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
import androidx.compose.foundation.lazy.rememberLazyListState
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
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
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
import kotlinx.coroutines.flow.distinctUntilChanged
import me.meeshy.feature.reels.R
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.hexColor

/** Rows from the top (oldest end) that trigger [ReelCommentsViewModel.loadMore]. */
private const val LOAD_MORE_THRESHOLD = 3

/**
 * Comments overlay for an open reel (issue #4815) — a [ModalBottomSheet] raised above
 * the lecteur without leaving it: the video keeps playing behind the sheet (the pager
 * page never changes), and the sheet dismisses on the usual gestures (drag down, tap
 * scrim, back). Parity with [StoryCommentsSheet]'s law: cold-only spinner, stale-kept
 * refresh, optimistic posting with tap-to-retry on failure.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReelCommentsSheet(
    reelId: String,
    onDismiss: () -> Unit,
    onOpenPost: () -> Unit = {},
    initialCommentCount: Int? = null,
    viewModel: ReelCommentsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(reelId) { viewModel.load(reelId) }

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
            Row(verticalAlignment = Alignment.CenterVertically) {
                // The server-known total (`initialCommentCount`, from the reel row's own
                // `commentCount`) is the title's count whenever it is at least as large as
                // what is loaded on screen — `state.comments.size` alone is a lower bound
                // capped at whatever page(s) have loaded, never the reel's real total.
                val displayCount = maxOf(initialCommentCount ?: 0, state.comments.size)
                Text(
                    text = if (displayCount == 0) {
                        stringResource(R.string.reels_comments_title)
                    } else {
                        stringResource(R.string.reels_comments_count, displayCount)
                    },
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f),
                )
                TextButton(onClick = onOpenPost) {
                    Text(stringResource(R.string.reels_comments_view_post))
                }
            }

            when {
                state.isLoading -> LoadingRow(stringResource(R.string.reels_comments_loading))
                state.errorMessage != null ->
                    CenteredMessage(stringResource(R.string.reels_comments_error))
                state.isEmpty -> EmptyComments()
                else -> ReelCommentList(
                    comments = state.comments,
                    hasMore = state.hasMore,
                    isLoadingMore = state.isLoadingMore,
                    onLoadMore = viewModel::loadMore,
                    onRetry = viewModel::retry,
                )
            }

            ReelCommentInput(onSend = viewModel::post)
        }
    }
}

@Composable
private fun ReelCommentList(
    comments: List<ReelCommentPresentation>,
    hasMore: Boolean,
    isLoadingMore: Boolean,
    onLoadMore: () -> Unit,
    onRetry: (String) -> Unit,
) {
    val listState = rememberLazyListState()
    // Only a comment landing at the TAIL (a new send, or a live `comment:added`) pulls the
    // view down to it — `loadMore` prepends OLDER comments at the front, which must never
    // yank the viewer away from what they were reading (stable `key = { it.id }` below is
    // what lets Compose keep their scroll position steady across that prepend).
    LaunchedEffect(comments.lastOrNull()?.id) {
        if (comments.isNotEmpty()) listState.animateScrollToItem(comments.lastIndex)
    }
    LaunchedEffect(listState, hasMore) {
        snapshotFlow { listState.firstVisibleItemIndex }
            .distinctUntilChanged()
            .collect { firstVisible -> if (hasMore && firstVisible <= LOAD_MORE_THRESHOLD) onLoadMore() }
    }
    LazyColumn(
        state = listState,
        modifier = Modifier.heightIn(max = 420.dp),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        if (isLoadingMore) {
            item(key = "load-more-spinner") {
                Box(modifier = Modifier.fillMaxWidth().padding(vertical = MeeshySpacing.xs), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp))
                }
            }
        }
        items(comments, key = { it.id }) { comment ->
            ReelCommentRow(comment, onRetry)
        }
    }
}

@Composable
private fun ReelCommentRow(comment: ReelCommentPresentation, onRetry: (String) -> Unit) {
    val isPending = comment.status == ReelCommentStatus.Pending
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
            if (comment.status == ReelCommentStatus.Failed && failedClientId != null) {
                Text(
                    text = stringResource(R.string.reels_comments_failed),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.clickable { onRetry(failedClientId) },
                )
            }
        }
    }
}

@Composable
private fun ReelCommentInput(onSend: (String) -> Unit) {
    var draft by rememberSaveable { mutableStateOf("") }
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
            placeholder = { Text(stringResource(R.string.reels_comments_input_hint)) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
            keyboardActions = KeyboardActions(onSend = { submit() }),
        )
        IconButton(onClick = ::submit, enabled = canSend) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.Send,
                contentDescription = stringResource(R.string.reels_comments_send),
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
            text = stringResource(R.string.reels_comments_empty_title),
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.Center,
        )
        Text(
            text = stringResource(R.string.reels_comments_empty_subtitle),
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
