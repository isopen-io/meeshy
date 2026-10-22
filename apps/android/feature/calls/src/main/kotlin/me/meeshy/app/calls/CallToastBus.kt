package me.meeshy.app.calls

import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.receiveAsFlow
import me.meeshy.ui.component.FeedbackKind
import javax.inject.Inject
import javax.inject.Singleton

/** A local-action feedback: the result of something the user just did during a call. */
data class CallToast(
    val message: String,
    val kind: FeedbackKind = FeedbackKind.Info,
)

/**
 * The way to tell the user the outcome of a local call action from OUTSIDE the
 * UI — a controller, a handler, a worker: [post] it, and the [CallToastHost] on
 * the call screen shows it (tier 1 of the in-app notification system: success /
 * error / info of a user action, never a network event).
 *
 *  - **Buffered without a collector.** A toast posted while the call screen is not
 *    composed (rotation, the call minimised) waits for the host and is shown when
 *    it returns; the buffer is small and drops the OLDEST, so a burst never grows
 *    without bound and the most recent news survives.
 *  - **No stutter.** The same text is not repeated within [DEDUPE_WINDOW_MS]: a
 *    handler that fails on every retry tells the user once, not ten times.
 */
@Singleton
class CallToastBus @Inject constructor(
    private val clock: CallClock,
) {
    private val queue = Channel<CallToast>(capacity = BUFFER, onBufferOverflow = BufferOverflow.DROP_OLDEST)

    /** When each text was last let through, pruned to the dedupe window on every post. */
    private val recent = LinkedHashMap<String, Long>()

    /** The toasts to show, in posting order. One host collects them. */
    val toasts: Flow<CallToast> = queue.receiveAsFlow()

    /** Queues [toast]. `false` when it is blank or repeats a text shown under [DEDUPE_WINDOW_MS] ago. */
    fun post(toast: CallToast): Boolean {
        if (toast.message.isBlank()) return false
        if (!admit(toast.message)) return false
        return queue.trySend(toast).isSuccess
    }

    fun error(message: String): Boolean = post(CallToast(message, FeedbackKind.Error))

    fun success(message: String): Boolean = post(CallToast(message, FeedbackKind.Success))

    fun info(message: String): Boolean = post(CallToast(message, FeedbackKind.Info))

    private fun admit(message: String): Boolean = synchronized(recent) {
        val now = clock.nowMs()
        recent.values.removeAll { now - it >= DEDUPE_WINDOW_MS }
        if (message in recent) return@synchronized false
        recent[message] = now
        true
    }

    companion object {
        /** The same text is not shown twice under this delay. */
        const val DEDUPE_WINDOW_MS = 2_000L

        private const val BUFFER = 8
    }
}
