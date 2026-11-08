package me.meeshy.app.chat.share

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import me.meeshy.sdk.feedback.FeedbackToastCenter
import me.meeshy.sdk.model.feedback.FeedbackToastKind

/** Donne à la feuille de partage la pile de toasts de l'application : « Envoyé à X · Ouvrir » s'affiche une fois la feuille fermée. */
@HiltViewModel
internal class ShareToastViewModel @Inject constructor(
    private val center: FeedbackToastCenter,
) : ViewModel() {
    fun announce(message: String, open: (() -> Unit)?) = center.show(message, FeedbackToastKind.SUCCESS, open)
}
