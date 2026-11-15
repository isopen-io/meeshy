package me.meeshy.app.widget

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiConversation
import org.junit.Test

class MarkReadWidgetActionTest {

    private class FakePort(var stored: ApiConversation?, private val failure: Exception? = null) : WidgetReadPort {
        var queued = 0
        override suspend fun snapshot(conversationId: String) = stored?.takeIf { it.id == conversationId }
        override suspend fun markReadOptimistic(conversationId: String): Boolean {
            val current = stored ?: return false
            if (current.unreadCount == 0) return false
            stored = current.copy(unreadCount = 0)
            failure?.let { throw it }
            queued++
            return true
        }
        override suspend fun restore(conversation: ApiConversation) { stored = conversation }
    }

    private fun unread(count: Int = 3) = ApiConversation(id = "c1", type = "direct", unreadCount = count)

    private fun action(port: WidgetReadPort, signedIn: Boolean = true) = MarkReadWidgetAction(port) { signedIn }

    @Test
    fun `an unread row is read at once and the receipt joins the outbox`() = runTest {
        val port = FakePort(unread())

        val outcome = action(port).run("c1")

        assertThat(outcome).isEqualTo(MarkReadWidgetAction.Outcome.MARKED)
        assertThat(port.stored?.unreadCount).isEqualTo(0)
        assertThat(port.queued).isEqualTo(1)
    }

    @Test
    fun `a second tap queues nothing more`() = runTest {
        val port = FakePort(unread())
        val action = action(port)

        action.run("c1")
        val second = action.run("c1")

        assertThat(second).isEqualTo(MarkReadWidgetAction.Outcome.ALREADY_READ)
        assertThat(port.queued).isEqualTo(1)
    }

    @Test
    fun `a failure restores the counter`() = runTest {
        val port = FakePort(unread(5), failure = IllegalStateException("disk"))

        val outcome = action(port).run("c1")

        assertThat(outcome).isEqualTo(MarkReadWidgetAction.Outcome.FAILED)
        assertThat(port.stored?.unreadCount).isEqualTo(5)
    }

    @Test
    fun `a closed session, an unknown or an unsafe id do nothing`() = runTest {
        val port = FakePort(unread())

        assertThat(action(port, signedIn = false).run("c1")).isEqualTo(MarkReadWidgetAction.Outcome.SIGNED_OUT)
        assertThat(action(port).run("zz")).isEqualTo(MarkReadWidgetAction.Outcome.UNKNOWN)
        assertThat(action(port).run("a/b")).isEqualTo(MarkReadWidgetAction.Outcome.UNKNOWN)
        assertThat(port.queued).isEqualTo(0)
        assertThat(port.stored?.unreadCount).isEqualTo(3)
    }
}
