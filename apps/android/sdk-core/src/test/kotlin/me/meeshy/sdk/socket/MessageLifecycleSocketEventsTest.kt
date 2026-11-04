package me.meeshy.sdk.socket

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestCoroutineScheduler
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.BridgeAnnouncement
import me.meeshy.sdk.model.UnreadUpdateEvent
import me.meeshy.sdk.net.MeeshyApi
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class MessageLifecycleSocketEventsTest {
    private val scheduler = TestCoroutineScheduler()

    @Test
    fun `mention created est route avec ses seuls identifiants requis`() = runTest {
        val handlers = mutableMapOf<String, (Array<Any>) -> Unit>()
        val socket: SocketManager = mockk(relaxed = true)
        every { socket.on(any(), any()) } answers { handlers[firstArg()] = secondArg() }
        val router = SocketEventRouter(SocketEventRegistrar { event, callback -> socket.on(event, callback) }, StandardTestDispatcher(scheduler))
        val events = MessageLifecycleSocketEvents(router, MeeshyApi.json).also { it.attach() }

        events.mentionCreated.test {
            handlers.getValue("mention:created").invoke(arrayOf(JSONObject("""{"messageId":"m1","conversationId":"c1"}""")))
            scheduler.advanceUntilIdle()
            val event = awaitItem()
            assertThat(event.messageId).isEqualTo("m1")
            assertThat(event.mentionedUserId).isNull()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `le champ bridge garde ses trois etats avec le decodeur de la passerelle`() {
        fun decode(raw: String) = MeeshyApi.json.decodeFromString(UnreadUpdateEvent.serializer(), raw)

        assertThat(decode("""{"conversationId":"c1","unreadCount":1}""").bridge).isEqualTo(BridgeAnnouncement.NotComputed)
        assertThat(decode("""{"conversationId":"c1","unreadCount":0,"bridge":null}""").bridge).isEqualTo(BridgeAnnouncement.Cleared)
        assertThat(decode("""{"conversationId":"c1","unreadCount":2,"bridge":{"kind":"fallback","unreadCount":2}}""").bridge)
            .isInstanceOf(BridgeAnnouncement.Announced::class.java)
    }
}
