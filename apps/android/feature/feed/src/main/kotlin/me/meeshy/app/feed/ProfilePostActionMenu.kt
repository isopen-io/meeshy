package me.meeshy.app.feed

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.ClipboardManager
import androidx.compose.ui.text.AnnotatedString
import me.meeshy.sdk.feedback.FeedbackToastCenter
import me.meeshy.sdk.model.feedback.FeedbackToastKind
import me.meeshy.sdk.model.share.ShareCard
import me.meeshy.sdk.model.share.ShareSubject
import me.meeshy.ui.share.ShareLauncher
import me.meeshy.ui.share.open

/**
 * Le dialogue en attente du menu d'une carte du profil : la suppression ET le signalement attendent une
 * confirmation (iOS `ProfileUserPostsList` : confirmation avant tout geste destructeur ou irréversible).
 */
sealed interface ProfilePostDialog {
    val postId: String

    data class ConfirmDelete(override val postId: String) : ProfilePostDialog
    data class ChooseReport(override val postId: String) : ProfilePostDialog
}

/**
 * Le menu « ⋯ » d'une carte du profil selon la PROPRIÉTÉ : mon post offre épingler / supprimer, celui d'autrui
 * offre signaler. La liste et l'ordre viennent de [PostActionMenu] (source unique) ; ici seulement la
 * projection pour une carte de profil.
 */
internal object ProfilePostActionMenu {

    fun actions(isOwn: Boolean, isBookmarked: Boolean, hasText: Boolean): List<PostAction> =
        PostActionMenu.actions(PostActionContext(isOwn = isOwn, isBookmarked = isBookmarked, hasText = hasText))

    fun isOwn(authorId: String?, currentUserId: String?): Boolean = authorId != null && authorId == currentUserId
}

/** Les dialogues de confirmation du profil, câblés sur les événements du ViewModel. */
@Composable
internal fun ProfilePostDialogs(dialog: ProfilePostDialog?, onEvent: (ProfilePostsEvent) -> Unit) {
    when (dialog) {
        is ProfilePostDialog.ConfirmDelete -> DeletePostDialog(
            onDismiss = { onEvent(ProfilePostsEvent.DismissDialog) },
            onConfirm = { onEvent(ProfilePostsEvent.ConfirmDelete) },
        )
        is ProfilePostDialog.ChooseReport -> ReportPostDialog(
            onDismiss = { onEvent(ProfilePostsEvent.DismissDialog) },
            onReport = { reason -> onEvent(ProfilePostsEvent.ConfirmReport(reason)) },
        )
        null -> Unit
    }
}

/** Les gestes de partage et de copie d'une carte du profil, rassemblés pour que la liste n'en porte aucun détail. */
internal class ProfilePostCardActions(
    private val clipboard: ClipboardManager,
    private val shareLauncher: ShareLauncher?,
    private val shareOut: (ShareCard) -> Unit,
    private val linkCopier: (String, (String) -> Unit) -> Unit,
    private val linkCopied: String,
    private val toasts: FeedbackToastCenter,
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
            toasts.show(linkCopied, FeedbackToastKind.SUCCESS)
        }
    }

    fun copyText(post: FeedPostPresentation) = clipboard.setText(AnnotatedString(post.content))
}
