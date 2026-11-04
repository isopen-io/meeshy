package me.meeshy.app.feed

import androidx.compose.runtime.Composable

/**
 * Le dialogue en attente du menu d'une carte du profil : la suppression ET le signalement attendent une
 * confirmation (iOS `ProfileUserPostsList` : confirmation avant tout geste destructeur ou irréversible).
 */
sealed interface ProfilePostDialog {
    val postId: String

    data class ConfirmDelete(override val postId: String) : ProfilePostDialog
    data class ChooseReport(override val postId: String) : ProfilePostDialog

    /** « Citer » (#12234) : le compositeur de citation, ouvert sur la racine de la carte touchée. */
    data class Quote(val composer: QuoteComposerState) : ProfilePostDialog {
        override val postId: String get() = composer.postId
    }
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
        is ProfilePostDialog.Quote -> QuoteComposerSheet(
            composer = dialog.composer,
            onTextChange = { onEvent(ProfilePostsEvent.QuoteTextChanged(it)) },
            onSubmit = { onEvent(ProfilePostsEvent.SubmitQuote) },
            onDismiss = { onEvent(ProfilePostsEvent.DismissDialog) },
        )
        null -> Unit
    }
}
