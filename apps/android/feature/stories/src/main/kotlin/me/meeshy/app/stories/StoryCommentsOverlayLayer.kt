package me.meeshy.app.stories

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.app.feed.PostCommentsViewModel
import me.meeshy.sdk.model.StoryComment

/**
 * L'overlay de commentaires branché sur son [StoryCommentsViewModel] (un par story ouverte) : le fil, la chasse du
 * commentaire visé par une notification, « Répondre » (expose `replyTarget` ET arme le composeur épinglé), la
 * modification en place, le retrait avec motif et le signalement. La fermeture du fil (#16930) se lit sur le fil
 * épinglé [commentThread] — UNE source : la story l'y pose, un refus `COMMENTS_DISABLED` aussi.
 */
@Composable
internal fun StoryCommentsOverlayLayer(
    storyId: String,
    request: StoryCommentsOverlayRequest,
    composerPinned: Boolean,
    composerHeightPx: Int,
    commentThread: PostCommentsViewModel?,
) {
    val viewModel: StoryCommentsViewModel = hiltViewModel(key = "story-comments-$storyId")
    val state by viewModel.state.collectAsStateWithLifecycle()
    val threadClosed = commentThread?.let { thread ->
        val threadState by thread.state.collectAsStateWithLifecycle()
        threadState.commentsClosed
    } == true
    var removing by remember(storyId) { mutableStateOf<StoryComment?>(null) }
    var reporting by remember(storyId) { mutableStateOf<StoryComment?>(null) }
    DisposableEffect(storyId) {
        viewModel.begin(storyId)
        onDispose { viewModel.begin(null) }
    }
    val target = request.targetCommentId
    LaunchedEffect(target, state.comments.hasLoaded) {
        if (target != null && state.comments.hasLoaded && !state.comments.contains(target)) {
            viewModel.huntTarget(target, request.targetParentCommentId)
        }
    }
    val actions = remember(viewModel, commentThread) {
        StoryCommentsOverlayActions(
            row = StoryCommentRowCallbacks(
                onReply = { comment ->
                    viewModel.setReplyTarget(comment)
                    commentThread?.beginReply(comment.id)
                },
                onToggleLike = viewModel::toggleLike,
                onToggleOriginal = viewModel::toggleOriginal,
                onCommitEdit = { id, text -> viewModel.edit(id, text) { commentThread?.setCommentsClosed(true) } },
                onDelete = viewModel::delete,
                onRequestRemove = { removing = it },
                onRequestReport = { reporting = it },
            ),
            onToggleThread = viewModel::toggleThread,
            onLoadMoreReplies = viewModel::loadMoreReplies,
            onLoadMoreRoots = viewModel::loadMoreRoots,
        )
    }
    val frame = rememberStoryCommentsFrame(composerPinned, composerHeightPx, request.topReservedPx)
    StoryCommentsOverlay(
        state = state.copy(commentsClosed = threadClosed),
        isStoryExpired = request.isStoryExpired,
        frame = frame,
        targetCommentId = target,
        targetParentCommentId = request.targetParentCommentId,
        actions = actions,
        onListTop = request.onListTop,
    )
    removing?.let { comment ->
        StoryRemoveDialog(onDismiss = { removing = null }, onConfirm = { reason ->
            removing = null
            viewModel.remove(comment.id, reason)
        })
    }
    reporting?.let { comment ->
        StoryReportSheet(
            onDismiss = { reporting = null },
            onSend = { reason, details, done -> viewModel.report(comment.id, reason, details, done) },
        )
    }
}
