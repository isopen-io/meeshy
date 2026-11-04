package me.meeshy.app.conversations

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import me.meeshy.sdk.feedback.FeedbackToastCenter
import me.meeshy.sdk.model.feedback.FeedbackToastKind

/** Donne à la fiche d'un lien la pile de toasts de l'application : enregistré, échec, erreur passent par le toast commun. */
@HiltViewModel
internal class ShareLinkFeedbackToasts @Inject constructor(
    private val center: FeedbackToastCenter,
) : ViewModel() {
    fun success(message: String) = center.show(message, FeedbackToastKind.SUCCESS)
    fun failure(message: String) = center.show(message, FeedbackToastKind.ERROR)
}
