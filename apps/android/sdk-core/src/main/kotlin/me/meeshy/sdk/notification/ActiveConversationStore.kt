package me.meeshy.sdk.notification

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Process-level record of the conversation currently on screen (feature-parity §M).
 *
 * The in-app notification surfaces ([NotificationBannerViewModel] / [NotificationToastViewModel])
 * track the active thread inside their own ViewModel, but a background component — the FCM push
 * service — has no ViewModel to read. This singleton is the seam that carries that one nav truth
 * across the process boundary so a FOREGROUND push for the thread the reader is already looking at
 * can be suppressed ([me.meeshy.sdk.model.PushPresentationPolicy]).
 *
 * Written at the single nav-truth site (the root banner host's active-context effect) and read by
 * the push service; `null` means no conversation is on screen.
 */
@Singleton
public class ActiveConversationStore @Inject constructor() {

    private val _conversationId = MutableStateFlow<String?>(null)

    /** The conversation currently on screen, or `null` when none is. */
    public val conversationId: StateFlow<String?> = _conversationId.asStateFlow()

    /** Records the conversation now on screen (or `null` when leaving all threads). */
    public fun setActive(conversationId: String?) {
        _conversationId.value = conversationId
    }
}
