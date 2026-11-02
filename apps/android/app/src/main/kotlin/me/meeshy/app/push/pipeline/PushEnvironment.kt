package me.meeshy.app.push.pipeline

import android.app.NotificationManager
import android.content.Context
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ProcessLifecycleOwner
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.first
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.model.FocusFilterSnapshot
import me.meeshy.sdk.socket.SocketManager
import timber.log.Timber
import javax.inject.Inject

/** What the push pipeline samples from the device at reception — a seam so the pipeline stays testable. */
interface PushEnvironment {
    /** The process has a started activity (the user is looking at the app). */
    fun isAppInForeground(): Boolean

    /** The realtime socket is connected (only trusted by the gate in the foreground). */
    fun isSocketConnected(): Boolean

    /** `NotificationManager.currentInterruptionFilter`, read at reception (system Do-Not-Disturb). */
    fun interruptionFilter(): Int

    /** Unread conversations derived from the local cache, `null` when unknown. */
    suspend fun localUnreadConversations(): Int?

    fun nowMillis(): Long = System.currentTimeMillis()
}

class AndroidPushEnvironment @Inject constructor(
    @ApplicationContext private val context: Context,
    private val conversationRepository: ConversationRepository,
    private val socketManager: SocketManager,
) : PushEnvironment {

    override fun isSocketConnected(): Boolean = socketManager.isConnected

    override fun isAppInForeground(): Boolean =
        ProcessLifecycleOwner.get().lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)

    override fun interruptionFilter(): Int {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
        return manager?.currentInterruptionFilter ?: FocusFilterSnapshot.INTERRUPTION_FILTER_UNKNOWN
    }

    override suspend fun localUnreadConversations(): Int? = try {
        conversationRepository.totalUnreadCount().first()
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (failure: Exception) {
        Timber.w(failure, "Local unread count unavailable for the push badge")
        null
    }
}
