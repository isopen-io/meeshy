package me.meeshy.app.notifications

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.NotificationToastDecision
import me.meeshy.sdk.model.NotificationToastPolicy
import me.meeshy.sdk.model.ToastDedupWindow
import me.meeshy.sdk.notification.NotificationPreferencesStore
import me.meeshy.sdk.socket.MessageSocketManager
import javax.inject.Inject

/**
 * The in-app real-time notification toast orchestrator (feature-parity §M) — the stateful glue
 * that finally makes the three pure §M building blocks REAL: [ToastDedupWindow] (2 s dedup),
 * [NotificationToastPolicy] (active-screen/push/DND/per-type gate) and the `MeeshyNotificationToast`
 * atom. A faithful port of the toast half of iOS `NotificationToastManager`
 * (`handleNewNotification` + `showToast` + `onConversationOpened/onPostOpened`), with the decision
 * kept in the pure policy and only the "when" (clock, socket, timer) living here.
 *
 * Instant-app: [currentToast] is the single source of truth the mount reads; a duplicate delivery
 * or an on-screen conversation never surfaces a toast, and a shown toast auto-dismisses after
 * [TOAST_DURATION_MS] (7 s, iOS parity) unless replaced sooner (the pending dismiss is cancelled
 * when a newer toast appears — iOS `toastDismissTask?.cancel()`).
 */
@HiltViewModel
class NotificationToastViewModel @Inject constructor(
    private val messageSocketManager: MessageSocketManager,
    private val notificationPreferencesStore: NotificationPreferencesStore,
    private val clock: NotificationToastClock,
) : ViewModel() {

    private val _currentToast = MutableStateFlow<ApiNotification?>(null)
    val currentToast: StateFlow<ApiNotification?> = _currentToast.asStateFlow()

    private var dedupWindow = ToastDedupWindow.empty()
    private var activeConversationId: String? = null
    private var activePostId: String? = null
    private var dismissJob: Job? = null

    init {
        observeIncomingNotifications()
    }

    private fun observeIncomingNotifications() {
        viewModelScope.launch {
            messageSocketManager.notificationReceived.collect { handle(it) }
        }
    }

    private fun handle(notification: ApiNotification) {
        val admit = dedupWindow.admit(notification.id, clock.nowMillis())
        dedupWindow = admit.window
        val decision = NotificationToastPolicy.decide(
            notification = notification,
            activeConversationId = activeConversationId,
            activePostId = activePostId,
            isDuplicateDelivery = admit.isDuplicate,
            preferences = notificationPreferencesStore.preferences.value,
            now = clock.localDateTime(),
        )
        if (decision is NotificationToastDecision.Show) {
            show(decision.notification)
        }
    }

    private fun show(notification: ApiNotification) {
        dismissJob?.cancel()
        _currentToast.value = notification
        dismissJob = viewModelScope.launch {
            delay(TOAST_DURATION_MS)
            if (_currentToast.value?.id == notification.id) {
                _currentToast.value = null
            }
        }
    }

    /** The conversation is now on screen: track it and pull down any toast that belongs to it. */
    fun onConversationOpened(conversationId: String) {
        activeConversationId = conversationId
        if (_currentToast.value?.context?.conversationId == conversationId) dismiss()
    }

    fun onConversationClosed() {
        activeConversationId = null
    }

    /** The social content is now on screen: track it and pull down any toast that belongs to it. */
    fun onPostOpened(postId: String) {
        activePostId = postId
        if (_currentToast.value?.context?.postId == postId) dismiss()
    }

    /** Conditional on identity so a rapid A→B switch (A's close after B's open) does not clear B. */
    fun onPostClosed(postId: String? = null) {
        if (postId == null || postId == activePostId) activePostId = null
    }

    fun dismiss() {
        dismissJob?.cancel()
        dismissJob = null
        _currentToast.value = null
    }

    companion object {
        /** iOS `NotificationToastManager.toastDuration`: 7 s. */
        const val TOAST_DURATION_MS: Long = 7_000L
    }
}
