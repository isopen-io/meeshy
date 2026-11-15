package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.CompletableDeferred
import me.meeshy.sdk.model.call.CallEvent
import me.meeshy.sdk.model.call.CallFailureReason
import me.meeshy.sdk.model.call.CallState
import org.junit.Test

class CallTeardownControllerTest {

    private class FakeHost(var state: CallState = CallState.Connected) : CallSessionHost {
        val job = Job()
        override val scope = CoroutineScope(job + Dispatchers.Unconfined)
        override val config = CallConfig.EMPTY
        override val callId = "c1"
        override val selfId = "me"
        override val callState: CallState get() = state
        override val elapsedSeconds = 0L
        val dispatched = mutableListOf<CallEvent>()
        var mediaEnded = 0
        override fun dispatch(event: CallEvent) {
            dispatched += event
        }
        override fun endMedia() {
            mediaEnded++
        }
        override fun restartMediaIce() {}
        override fun publish() {}
        override fun cancelSessionJobs() = scope.coroutineContext[Job]!!.cancel()
    }

    @Test
    fun `after teardown no job is left, the media is released and every step ran`() {
        val host = FakeHost()
        val pending = CompletableDeferred<Unit>()
        val launched = host.scope.launch { pending.await() }
        var wakeLockHeld = true
        val controller = CallTeardownController(setOf(CallTeardownStep { wakeLockHeld = false }))

        controller.teardown(host)

        assertThat(launched.isActive).isFalse()
        assertThat(host.job.isActive).isFalse()
        assertThat(host.mediaEnded).isEqualTo(1)
        assertThat(wakeLockHeld).isFalse()
    }

    @Test
    fun `a failing step never blocks the next ones`() {
        val host = FakeHost()
        var ran = false
        val controller = CallTeardownController(
            linkedSetOf(CallTeardownStep { error("boom") }, CallTeardownStep { ran = true }),
        )

        controller.teardown(host)

        assertThat(ran).isTrue()
        assertThat(host.mediaEnded).isEqualTo(1)
    }

    @Test
    fun `teardown can be replayed without effect on the second pass`() {
        val host = FakeHost()
        val controller = CallTeardownController(emptySet())

        controller.teardown(host)
        controller.teardown(host)

        assertThat(host.job.isActive).isFalse()
    }

    @Test
    fun `failing a live call ends it with the precise reason`() {
        val host = FakeHost(CallState.Connecting)

        CallTeardownController(emptySet()).failCall(host, CallFailureReason.ConnectTimedOut)

        assertThat(host.dispatched).containsExactly(CallEvent.ConnectionFailed("connect timed out"))
    }

    @Test
    fun `failing an already ended call changes nothing`() {
        val host = FakeHost(CallState.Idle)

        CallTeardownController(emptySet()).failCall(host, CallFailureReason.Unknown)

        assertThat(host.dispatched).isEmpty()
    }
}
