package me.meeshy.ui.component.comments

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import kotlinx.coroutines.delay
import me.meeshy.sdk.model.comments.CommentReplyFocus

/**
 * Les ancres `comment-<id>` des rangées d'un fil (iOS `ScrollViewReader` + `id("comment-…")`) : chaque rangée racine ou
 * réponse dépliée s'enregistre, et [KeepsReplyTargetInView] ramène la cible au bas de la zone visible, juste au-dessus
 * du composeur, une fois le clavier posé.
 */
@Stable
public class CommentAnchors {
    private val requesters = HashMap<String, BringIntoViewRequester>()

    @OptIn(ExperimentalFoundationApi::class)
    internal fun requester(anchor: String): BringIntoViewRequester = requesters.getOrPut(anchor) { BringIntoViewRequester() }

    internal fun release(anchor: String) {
        requesters.remove(anchor)
    }

    @OptIn(ExperimentalFoundationApi::class)
    internal suspend fun reveal(anchor: String) {
        requesters[anchor]?.bringIntoView()
    }
}

public val LocalCommentAnchors = compositionLocalOf<CommentAnchors?> { null }

@Composable
public fun ProvideCommentAnchors(content: @Composable (CommentAnchors) -> Unit) {
    val anchors = remember { CommentAnchors() }
    CompositionLocalProvider(LocalCommentAnchors provides anchors) { content(anchors) }
}

/** Pose l'ancre `comment-<commentId>` sur une rangée ; sans fournisseur au-dessus, elle ne fait rien. */
@OptIn(ExperimentalFoundationApi::class)
public fun Modifier.commentAnchor(commentId: String): Modifier = composed {
    val anchors = LocalCommentAnchors.current ?: return@composed this
    val anchor = CommentReplyFocus.scrollTarget(commentId) ?: return@composed this
    DisposableEffect(anchors, anchor) { onDispose { anchors.release(anchor) } }
    this.bringIntoViewRequester(anchors.requester(anchor))
}

/**
 * Garde la cible d'une réponse en vue (#8644) : à chaque NOUVELLE cible, attend le réglage du clavier
 * ([CommentReplyFocus.KEYBOARD_SETTLE_MILLIS]) puis ramène son ancre dans la zone visible. Une réponse qui se referme ne
 * défile pas.
 */
@Composable
public fun KeepsReplyTargetInView(replyingToId: String?, anchors: CommentAnchors) {
    LaunchedEffect(replyingToId) {
        val target = CommentReplyFocus.scrollTarget(replyingToId) ?: return@LaunchedEffect
        delay(CommentReplyFocus.KEYBOARD_SETTLE_MILLIS)
        anchors.reveal(target)
    }
}
