package me.meeshy.app.reels

import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.app.feed.PostCommentsThreadSheet
import me.meeshy.app.feed.rememberPostCommentsViewModel
import me.meeshy.feature.reels.R

/**
 * Les commentaires d'un réel ouvert (iOS `FeedCommentsSheet`, #14313) : LE fil des posts — un réel en est un —, avec
 * ses réponses, ses cœurs, ses traductions et le composeur universel réglé pour un commentaire, pièces jointes
 * comprises. La lecture continue derrière la feuille. Le titre garde le total servi par la carte du réel tant qu'il
 * dépasse ce qui est chargé (une page n'est qu'une borne basse).
 */
@Composable
internal fun ReelCommentsThread(
    reelId: String,
    serverCommentCount: Int?,
    onDismiss: () -> Unit,
    onOpenPost: () -> Unit,
) {
    val thread = rememberPostCommentsViewModel(reelId)
    val state by thread.state.collectAsStateWithLifecycle()
    val count = maxOf(serverCommentCount ?: 0, state.comments.size)
    PostCommentsThreadSheet(
        viewModel = thread,
        title = if (count == 0) stringResource(R.string.reels_comments_title) else pluralStringResource(R.plurals.reels_comments_count, count, count),
        onDismiss = onDismiss,
        headerAction = { TextButton(onClick = onOpenPost) { Text(stringResource(R.string.reels_comments_view_post)) } },
    )
}
