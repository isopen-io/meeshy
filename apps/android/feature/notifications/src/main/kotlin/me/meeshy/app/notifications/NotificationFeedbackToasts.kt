package me.meeshy.app.notifications

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import me.meeshy.sdk.feedback.FeedbackToastCenter
import me.meeshy.sdk.model.feedback.FeedbackToastKind

/** Donne à la cloche la pile de toasts de l'application : un échec d'action s'annonce par le toast commun, plus par un Snackbar propre à l'écran. */
@HiltViewModel
class NotificationFeedbackToasts @Inject constructor(
    private val center: FeedbackToastCenter,
) : ViewModel() {
    fun failure(message: String) = center.show(message, FeedbackToastKind.ERROR)
}
