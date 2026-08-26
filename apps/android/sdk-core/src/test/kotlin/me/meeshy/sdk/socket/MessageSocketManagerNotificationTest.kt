package me.meeshy.sdk.socket

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import me.meeshy.sdk.sync.SyncSeqTracker
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Covers only the `notification:new` wiring added for real-time in-app notifications
 * (feature-parity §M). [MessageSocketManager]'s other 26 events have no existing test
 * coverage — this file intentionally does not attempt to backfill them.
 */
@RunWith(RobolectricTestRunner::class)
class MessageSocketManagerNotificationTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    private fun managerWithHandlers(
        tracker: SyncSeqTracker = SyncSeqTracker(),
    ): Pair<MessageSocketManager, Map<String, (Array<Any>) -> Unit>> {
        val socket: SocketManager = mockk(relaxed = true)
        val handlers = mutableMapOf<String, (Array<Any>) -> Unit>()
        every { socket.on(any(), any()) } answers {
            handlers[firstArg()] = secondArg()
        }
        val manager = MessageSocketManager(socket, json, tracker)
        manager.attach()
        return manager to handlers
    }

    private fun frame(id: String, seq: Any? = null): Array<Any> {
        val payload = JSONObject(
            """{"id":"$id","type":"new_message","state":{"isRead":false,"createdAt":"2026-08-17T00:00:00.000Z"},"title":"Alice","subtitle":"Bonjour"}""",
        )
        if (seq != null) payload.put("_seq", seq)
        return arrayOf(payload)
    }

    @Test
    fun `notification new payload is decoded and emitted`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        manager.notificationReceived.test {
            handlers.getValue("notification:new").invoke(frame("n1", seq = 42L))
            val event = awaitItem()
            assertThat(event.id).isEqualTo("n1")
            assertThat(event.type).isEqualTo("new_message")
            assertThat(event.state.isRead).isFalse()
            cancelAndIgnoreRemainingEvents()
        }
    }

    /**
     * `_seq` is dropped by the decoder (`ignoreUnknownKeys`), so the ONLY place it can be
     * read is the raw payload. Before this wiring Android was the one client that let the
     * gateway's gap-detection cursor fall on the floor.
     */
    @Test
    fun `notification new advances the sync seq cursor`() {
        val tracker = SyncSeqTracker()
        val (_, handlers) = managerWithHandlers(tracker)

        handlers.getValue("notification:new").invoke(frame("n1", seq = 42L))

        assertThat(tracker.lastSeq).isEqualTo(42L)
    }

    @Test
    fun `a jump in seq reports a gap`() = runTest {
        val tracker = SyncSeqTracker()
        val (_, handlers) = managerWithHandlers(tracker)
        val notify = handlers.getValue("notification:new")

        tracker.gapDetected.test {
            notify.invoke(frame("n1", seq = 42L))
            notify.invoke(frame("n2", seq = 43L))
            expectNoEvents()
            notify.invoke(frame("n3", seq = 46L)) // 44, 45 manqués
            assertThat(awaitItem()).isEqualTo(46L)
            cancelAndIgnoreRemainingEvents()
        }
    }

    /**
     * The gateway emits deliberately WITHOUT `_seq` when the counter allocation rejects or
     * overruns its deadline; an older gateway emits none at all. Neither is a gap.
     */
    @Test
    fun `a payload without seq leaves the cursor untouched`() {
        val tracker = SyncSeqTracker()
        val (_, handlers) = managerWithHandlers(tracker)
        val notify = handlers.getValue("notification:new")

        notify.invoke(frame("n1", seq = 42L))
        notify.invoke(frame("n2"))

        assertThat(tracker.lastSeq).isEqualTo(42L)
    }

    /** A non-numeric `_seq` is not a cursor — it must not be coerced into one. */
    @Test
    fun `a non numeric seq is ignored`() {
        val tracker = SyncSeqTracker()
        val (_, handlers) = managerWithHandlers(tracker)

        handlers.getValue("notification:new").invoke(frame("n1", seq = "oops"))

        assertThat(tracker.lastSeq).isNull()
    }
}
