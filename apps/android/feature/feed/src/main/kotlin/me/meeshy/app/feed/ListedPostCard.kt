package me.meeshy.app.feed

import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import kotlinx.coroutines.launch
import me.meeshy.feature.feed.R

/**
 * Ce qu'une carte de liste ouvre par-dessus la liste : le signalement, la confirmation de suppression et la feuille des
 * commentaires — un seul à la fois, comme dans le fil.
 */
@Stable
internal class ListedPostSheets {
    var reporting by mutableStateOf<String?>(null)
    var deleting by mutableStateOf<String?>(null)
    var commentsOf by mutableStateOf<String?>(null)
        private set
    var replyTo by mutableStateOf<String?>(null)
        private set

    fun openComments(postId: String, replyToCommentId: String? = null) {
        commentsOf = postId
        replyTo = replyToCommentId
    }

    fun closeComments() {
        commentsOf = null
        replyTo = null
    }
}

/**
 * **La carte du fil, montée par une liste** (#13244 ; iOS : `BookmarksView`, `HashtagResultsView`,
 * `ProfileUserPostsList` montent `FeedPostCard`). Chaque bouton de la rangée et du menu « ⋯ » reçoit son effet de
 * [actions] — le contrat [ListedPostCardActions] — ou de [share] ; rien n'y est laissé vide. Toucher un réel l'ouvre dans
 * le lecteur, toucher un post son détail.
 */
@Composable
internal fun ListedPostCard(
    post: FeedPostPresentation,
    actions: ListedPostCardActions,
    sheets: ListedPostSheets,
    share: PostCardShareActions,
    onOpenPost: (String) -> Unit,
    onOpenReel: (String) -> Unit,
    onOpenProfile: ((String) -> Unit)?,
    onOpenHashtag: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val open = { if (post.isReel) onOpenReel(post.id) else onOpenPost(post.id) }
    PostCard(
        post = post,
        onLike = { actions.toggleLike(post.id) },
        onBookmark = { actions.toggleBookmark(post.id) },
        onFlagTap = { code -> actions.onFlagTap(post.id, code) },
        onClick = open,
        onOpenPost = onOpenPost,
        onOpenReel = onOpenReel,
        onImageTap = { open() },
        isOwn = post.isAuthor,
        onShare = { share.share(post) },
        onSend = { share.send(post) },
        onCopyLink = { share.copyLink(post) },
        onCopyText = { share.copyText(post) },
        onOpenProfile = onOpenProfile,
        onRepost = { actions.repost(post.id) },
        onQuote = { actions.beginQuote(post.id) },
        onPin = { actions.pin(post.id) },
        onReport = { sheets.reporting = post.id },
        onDelete = { sheets.deleting = post.id },
        onComments = { sheets.openComments(post.id) },
        onReplyToComment = { commentId -> sheets.openComments(post.id, commentId) },
        onOpenHashtag = onOpenHashtag,
        modifier = modifier,
    )
}

/**
 * Ce qui s'ouvre par-dessus une liste de cartes : signalement, suppression, commentaires et compositeur de citation, puis
 * l'issue de chaque geste dite UNE fois dans [snackbar]. [commentCount] donne le compteur serveur de la carte ouverte.
 */
@Composable
internal fun ListedPostOverlays(
    sheets: ListedPostSheets,
    actions: ListedPostCardActions,
    quoteComposer: QuoteComposerState?,
    notice: FeedNotice?,
    commentCount: (String) -> Int,
    snackbar: SnackbarHostState,
    commentsClosed: (String) -> Boolean? = { null },
) {
    sheets.reporting?.let { postId ->
        ReportPostDialog(
            onDismiss = { sheets.reporting = null },
            onReport = { reason ->
                sheets.reporting = null
                actions.report(postId, reason)
            },
        )
    }
    sheets.deleting?.let { postId ->
        DeletePostDialog(
            onDismiss = { sheets.deleting = null },
            onConfirm = {
                sheets.deleting = null
                actions.delete(postId)
            },
        )
    }
    FeedCommentsSheetHost(
        postId = sheets.commentsOf,
        serverCount = sheets.commentsOf?.let(commentCount) ?: 0,
        replyToCommentId = sheets.replyTo,
        onDismiss = sheets::closeComments,
        onCommentSent = actions::onCommentSent,
        commentsClosed = sheets.commentsOf?.let(commentsClosed),
    )
    quoteComposer?.let { composer ->
        QuoteComposerSheet(
            composer = composer,
            onTextChange = actions::onQuoteTextChange,
            onSubmit = actions::submitQuote,
            onDismiss = actions::cancelQuote,
        )
    }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    LaunchedEffect(notice) {
        val said = notice ?: return@LaunchedEffect
        actions.consumeNotice()
        scope.launch { snackbar.showSnackbar(context.getString(said.messageRes())) }
    }
}

/** Les gestes de partage d'une liste, l'annonce « Lien copié » passant par [snackbar]. */
@Composable
internal fun rememberListedPostShare(snackbar: SnackbarHostState): PostCardShareActions {
    val scope = rememberCoroutineScope()
    val linkCopied = stringResource(R.string.feed_link_copied)
    return rememberPostCardShareActions(onLinkCopied = { scope.launch { snackbar.showSnackbar(linkCopied) } })
}

@Composable
internal fun rememberListedPostSheets(): ListedPostSheets = remember { ListedPostSheets() }
