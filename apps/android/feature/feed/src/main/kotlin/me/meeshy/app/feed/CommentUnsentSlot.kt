package me.meeshy.app.feed

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.comment.CommentOutboxRules
import me.meeshy.ui.component.comments.CommentUnsentBadge
import me.meeshy.ui.component.comments.CommentUnsentState
import me.meeshy.ui.theme.MeeshyPalette

/** Les gestes et les marques des commentaires de la file, lus par les rangées sans paramètre de plus. */
@Immutable
internal class CommentUnsentHost(
    val marks: Map<String, CommentUnsentState>,
    val onRetry: (String) -> Unit,
    val onResume: (String) -> Unit,
    val onDelete: (String) -> Unit,
)

internal val LocalCommentUnsent = compositionLocalOf<CommentUnsentHost?> { null }

/** Fournit la file des commentaires non envoyés aux rangées du fil (iOS `CommentUnsentBadge`). */
@Composable
internal fun ProvideCommentUnsent(viewModel: PostCommentsViewModel, content: @Composable () -> Unit) {
    val mirror = viewModel.outbox
    if (mirror == null) {
        content()
        return
    }
    val marks by mirror.states.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    val host = remember(marks, mirror, viewModel) {
        CommentUnsentHost(
            marks = marks,
            onRetry = { id -> scope.launch { mirror.retry(id) } },
            onResume = { id ->
                scope.launch {
                    mirror.resume(id)?.let { text ->
                        viewModel.onDraftChange(CommentOutboxRules.resuming(text, into = viewModel.state.value.draft))
                    }
                }
            },
            onDelete = { id -> scope.launch { mirror.cancel(id) } },
        )
    }
    CompositionLocalProvider(LocalCommentUnsent provides host, content = content)
}

/** La marque de la ligne [commentId] quand la file la porte encore ; rien sinon. */
@Composable
internal fun CommentUnsentSlot(commentId: String) {
    val host = LocalCommentUnsent.current ?: return
    if (!CommentOutboxRules.isLocal(commentId)) return
    val state = host.marks[commentId] ?: CommentUnsentState.Pending
    CommentUnsentBadge(
        state = state,
        accent = MeeshyPalette.Indigo500,
        onRetry = { host.onRetry(commentId) },
        onResume = { host.onResume(commentId) },
        onDelete = { host.onDelete(commentId) },
    )
}
