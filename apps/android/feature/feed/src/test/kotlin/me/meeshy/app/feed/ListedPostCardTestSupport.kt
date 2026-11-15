package me.meeshy.app.feed

import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import me.meeshy.sdk.model.report.ReportReason

/** Un hôte de cartes qui note chaque geste reçu — ce qu'une liste ferait de la carte touchée. */
internal class RecordingCardActions : ListedPostCardActions {
    val calls = mutableListOf<String>()
    override fun toggleLike(postId: String) { calls += "like:$postId" }
    override fun toggleBookmark(postId: String) { calls += "bookmark:$postId" }
    override fun repost(postId: String) { calls += "repost:$postId" }
    override fun beginQuote(postId: String) { calls += "quote:$postId" }
    override fun onFlagTap(postId: String, code: String) { calls += "flag:$postId:$code" }
    override fun onQuoteTextChange(text: String) = Unit
    override fun cancelQuote() = Unit
    override fun submitQuote() = Unit
    override fun pin(postId: String) { calls += "pin:$postId" }
    override fun report(postId: String, reason: ReportReason) { calls += "report:$postId:$reason" }
    override fun delete(postId: String) { calls += "delete:$postId" }
    override fun onCommentSent(postId: String) = Unit
    override fun consumeNotice() = Unit
}

/** Les gestes de partage d'une carte de test : rien ne sort de l'appareil, tout se note dans [shared]. */
@Composable
internal fun recordingShare(shared: MutableList<String>): PostCardShareActions = PostCardShareActions(
    clipboard = LocalClipboardManager.current,
    shareLauncher = null,
    shareOut = { shared += "share" },
    linkCopier = { id, ready -> shared += "link:$id"; ready("https://meeshy.me/p/$id") },
    onLinkCopied = { shared += "copied" },
    context = LocalContext.current,
)
