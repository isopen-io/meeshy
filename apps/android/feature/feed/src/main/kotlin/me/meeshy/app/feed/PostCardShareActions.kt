package me.meeshy.app.feed

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.ClipboardManager
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import me.meeshy.sdk.model.share.ShareCard
import me.meeshy.sdk.model.share.ShareSubject
import me.meeshy.ui.share.LocalShareLauncher
import me.meeshy.ui.share.ShareLauncher
import me.meeshy.ui.share.open

/**
 * Les gestes de partage et de copie d'une carte de publication, rassemblés pour que la liste qui la monte n'en porte aucun
 * détail (le profil, les favoris, « À proximité », les publications d'un auteur, un hashtag) : « Envoyer » ouvre la
 * feuille Meeshy, « Partager » celle du système (#14315), et l'hôte dit « Lien copié » à sa façon par [onLinkCopied].
 */
internal class PostCardShareActions(
    private val clipboard: ClipboardManager,
    private val shareLauncher: ShareLauncher?,
    private val shareOut: (ShareCard) -> Unit,
    private val linkCopier: (String, (String) -> Unit) -> Unit,
    private val onLinkCopied: () -> Unit,
    private val context: Context,
) {
    fun share(post: FeedPostPresentation) = shareOut(post.shareCard(context))

    fun send(post: FeedPostPresentation) {
        val card = post.shareCard(context)
        shareLauncher?.open(ShareSubject.Card(card)) ?: shareOut(card)
    }

    fun copyLink(post: FeedPostPresentation) {
        linkCopier(post.id) { url ->
            clipboard.setText(AnnotatedString(url))
            onLinkCopied()
        }
    }

    fun copyText(post: FeedPostPresentation) = clipboard.setText(AnnotatedString(post.content))
}

/** [PostCardShareActions] câblé sur le presse-papier, la feuille Meeshy, la feuille du système et le lien suivi du post. */
@Composable
internal fun rememberPostCardShareActions(onLinkCopied: () -> Unit): PostCardShareActions =
    PostCardShareActions(
        clipboard = LocalClipboardManager.current,
        shareLauncher = LocalShareLauncher.current,
        shareOut = rememberContentShareOut(),
        linkCopier = rememberPostLinkCopy(),
        onLinkCopied = onLinkCopied,
        context = LocalContext.current,
    )
