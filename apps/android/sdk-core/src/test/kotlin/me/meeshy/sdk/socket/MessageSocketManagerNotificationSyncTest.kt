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
 * Covers the notification-SYNC family added for issue notif-sync — `notification:read`,
 * `notification:read-bulk`, `notification:deleted`, `notification:deleted-bulk`,
 * `notification:counts`. Sibling of `MessageSocketManagerNotificationTest`, which covers
 * `notification:new` alone.
 */
@RunWith(RobolectricTestRunner::class)
class MessageSocketManagerNotificationSyncTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    private fun managerWithHandlers(): Pair<MessageSocketManager, Map<String, (Array<Any>) -> Unit>> {
        val socket: SocketManager = mockk(relaxed = true)
        val handlers = mutableMapOf<String, (Array<Any>) -> Unit>()
        every { socket.on(any(), any()) } answers {
            handlers[firstArg()] = secondArg()
        }
        val manager = MessageSocketManager(socket, json, SyncSeqTracker())
        manager.attach()
        return manager to handlers
    }

    private fun frame(json: String): Array<Any> = arrayOf(JSONObject(json))

    @Test
    fun `notification read is decoded and emitted`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        manager.notificationRead.test {
            handlers.getValue("notification:read").invoke(frame("""{"notificationId":"n1"}"""))
            assertThat(awaitItem().notificationId).isEqualTo("n1")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `notification deleted is decoded and emitted`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        manager.notificationDeleted.test {
            handlers.getValue("notification:deleted").invoke(frame("""{"notificationId":"n1"}"""))
            assertThat(awaitItem().notificationId).isEqualTo("n1")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `notification read-bulk decodes an all scope`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        manager.notificationReadBulk.test {
            handlers.getValue("notification:read-bulk").invoke(frame("""{"scope":{"kind":"all"}}"""))
            assertThat(awaitItem().scope.kind).isEqualTo("all")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `notification read-bulk decodes a context scope`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        manager.notificationReadBulk.test {
            handlers.getValue("notification:read-bulk").invoke(
                frame("""{"scope":{"kind":"context","contextKey":"conversationId","contextValue":"c1"}}"""),
            )
            val scope = awaitItem().scope
            assertThat(scope.kind).isEqualTo("context")
            assertThat(scope.contextKey).isEqualTo("conversationId")
            assertThat(scope.contextValue).isEqualTo("c1")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `notification read-bulk decodes a types scope`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        manager.notificationReadBulk.test {
            handlers.getValue("notification:read-bulk").invoke(
                frame("""{"scope":{"kind":"types","types":["user_mentioned","mention"]}}"""),
            )
            assertThat(awaitItem().scope.types).containsExactly("user_mentioned", "mention").inOrder()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `notification deleted-bulk decodes the read scope`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        manager.notificationDeletedBulk.test {
            handlers.getValue("notification:deleted-bulk").invoke(frame("""{"scope":{"kind":"read"}}"""))
            assertThat(awaitItem().scope.kind).isEqualTo("read")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `notification counts is decoded and emitted`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        manager.notificationCounts.test {
            handlers.getValue("notification:counts").invoke(frame("""{"unread":3,"total":12}"""))
            val counts = awaitItem()
            assertThat(counts.unread).isEqualTo(3)
            assertThat(counts.total).isEqualTo(12)
            cancelAndIgnoreRemainingEvents()
        }
    }

    /**
     * These five events are plain-emitted (no `_seq`, `NotificationService.ts`'s
     * `announceReadBulk`/`announceDeletedBulk`/`emitCountsUpdate` doc-comments) — unlike
     * `notification:new`, receiving one must NOT move the sync cursor.
     */
    @Test
    fun `none of the five sync events touch the sync seq cursor`() {
        val tracker = SyncSeqTracker()
        val socket: SocketManager = mockk(relaxed = true)
        val handlers = mutableMapOf<String, (Array<Any>) -> Unit>()
        every { socket.on(any(), any()) } answers { handlers[firstArg()] = secondArg() }
        MessageSocketManager(socket, json, tracker).attach()

        handlers.getValue("notification:read").invoke(frame("""{"notificationId":"n1"}"""))
        handlers.getValue("notification:read-bulk").invoke(frame("""{"scope":{"kind":"all"}}"""))
        handlers.getValue("notification:deleted").invoke(frame("""{"notificationId":"n1"}"""))
        handlers.getValue("notification:deleted-bulk").invoke(frame("""{"scope":{"kind":"read"}}"""))
        handlers.getValue("notification:counts").invoke(frame("""{"unread":0,"total":0}"""))

        assertThat(tracker.lastSeq).isNull()
    }
}
