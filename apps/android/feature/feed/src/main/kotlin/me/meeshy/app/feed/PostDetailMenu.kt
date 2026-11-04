package me.meeshy.app.feed

import android.content.Context
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import me.meeshy.feature.feed.R
import me.meeshy.sdk.model.report.ReportReason

/** Ce que le menu « ... » du detail demande a l'ecran : une action par entree de [PostActionMenu]. */
internal data class PostDetailMenuActions(
    val onShare: () -> Unit,
    val onCopyLink: () -> Unit,
    val onCopyText: () -> Unit,
    val onBookmarkToggle: () -> Unit,
    val onPin: () -> Unit,
    val onReport: (ReportReason) -> Unit,
    val onDelete: () -> Unit,
)

/**
 * Le menu « ... » complet de l'en-tete du detail (iOS `PostDetailView.postMenu`) : Copier le lien, Partager (le lien
 * suivi de l'utilisateur), Enregistrer, « Imager », puis — pour SON post — Epingler et Supprimer (avec confirmation),
 * pour celui d'autrui Signaler (avec ses motifs). La liste et son ordre viennent de [PostActionMenu], pas d'ici.
 */
@Composable
internal fun PostDetailMenu(post: FeedPostPresentation, actions: PostDetailMenuActions) {
    var reporting by remember(post.id) { mutableStateOf(false) }
    var deleting by remember(post.id) { mutableStateOf(false) }
    val imager = if (post.showsReelCard) null else rememberPostImager(post)
    if (reporting) {
        ReportPostDialog(onDismiss = { reporting = false }, onReport = { reason -> reporting = false; actions.onReport(reason) })
    }
    if (deleting) {
        DeletePostDialog(onDismiss = { deleting = false }, onConfirm = { deleting = false; actions.onDelete() })
    }
    Box {
        PostOptionsButton(
            isOwn = post.isAuthor,
            isBookmarked = post.isBookmarked,
            hasText = post.content.isNotBlank(),
            onShare = actions.onShare,
            onCopyLink = actions.onCopyLink,
            onCopyText = actions.onCopyText,
            onRepost = null,
            onQuote = null,
            onBookmarkToggle = actions.onBookmarkToggle,
            onPin = actions.onPin,
            onReport = { reporting = true },
            onDelete = { deleting = true },
            tint = me.meeshy.ui.theme.MeeshyTheme.tokens.textPrimary,
            onImager = imager,
        )
    }
}

/** Les actions du menu cablees sur le presse-papier, la feuille de partage du systeme et le ViewModel. */
@Composable
internal fun rememberPostDetailMenuActions(
    post: FeedPostPresentation,
    viewModel: PostDetailViewModel,
    onLinkCopied: () -> Unit,
): PostDetailMenuActions {
    val context: Context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    val shareOut = rememberContentShareOut()
    val copyPostLink = rememberPostLinkCopy()
    return remember(post.id, post.content, post.isBookmarked, viewModel, context) {
        PostDetailMenuActions(
            onShare = { shareOut(post.shareCard(context)) },
            onCopyLink = {
                copyPostLink(post.id) { url ->
                    clipboard.setText(AnnotatedString(url))
                    onLinkCopied()
                }
            },
            onCopyText = { clipboard.setText(AnnotatedString(post.content)) },
            onBookmarkToggle = viewModel::toggleBookmark,
            onPin = viewModel::pin,
            onReport = viewModel::report,
            onDelete = viewModel::delete,
        )
    }
}
