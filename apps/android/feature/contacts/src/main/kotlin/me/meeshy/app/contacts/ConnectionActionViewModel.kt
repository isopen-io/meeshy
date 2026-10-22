package me.meeshy.app.contacts

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharedFlow
import me.meeshy.sdk.friend.ConnectionActionController
import me.meeshy.sdk.model.friend.ConnectionFeedback
import javax.inject.Inject

/**
 * Thin host of the shared [ConnectionActionController] for the Contacts screens:
 * the chip's four gestures plus the one-shot feedback stream a screen mounts
 * through `ConnectionFeedbackHost`.
 */
@HiltViewModel
class ConnectionActionViewModel @Inject constructor(
    private val controller: ConnectionActionController,
) : ViewModel() {

    val feedback: SharedFlow<ConnectionFeedback> = controller.feedback

    fun add(userId: String) {
        controller.send(userId)
    }

    fun accept(userId: String) {
        controller.accept(userId)
    }

    fun decline(userId: String) {
        controller.decline(userId)
    }

    fun cancel(userId: String) {
        controller.cancel(userId)
    }
}
