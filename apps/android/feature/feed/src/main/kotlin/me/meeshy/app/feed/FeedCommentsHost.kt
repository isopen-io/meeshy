package me.meeshy.app.feed

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.res.pluralStringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.feed.R
import me.meeshy.sdk.model.comments.CommentsTitleCount

/**
 * Le bouton commentaire d'une carte du fil ouvre LA feuille des commentaires sur place, sans quitter l'écran (iOS
 * `FeedCommentsSheet`). [postId] nul = fermée. Quand l'utilisateur envoie, [onCommentSent] fait suivre le compteur de la carte.
 */
@Composable
internal fun FeedCommentsSheetHost(
    postId: String?,
    serverCount: Int,
    onDismiss: () -> Unit,
    onCommentSent: (String) -> Unit,
    replyToCommentId: String? = null,
    commentsClosed: Boolean? = null,
) {
    if (postId == null) return
    val thread = rememberPostCommentsViewModel(postId)
    val state by thread.state.collectAsStateWithLifecycle()
    LaunchedEffect(thread, replyToCommentId) { replyToCommentId?.let(thread::beginReply) }
    val count = CommentsTitleCount.of(serverCount, state.comments.size)
    PostCommentsThreadSheet(
        viewModel = thread,
        title = pluralStringResource(R.plurals.feed_post_stat_comments, count, count),
        onDismiss = onDismiss,
        onCommentSent = onCommentSent,
        commentsClosed = commentsClosed,
    )
}
