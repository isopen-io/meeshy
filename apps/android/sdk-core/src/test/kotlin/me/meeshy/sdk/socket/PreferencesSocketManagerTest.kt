package me.meeshy.sdk.socket

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Behavioural spec for the preferences socket bridge: the conversation arm of the
 * `user:preferences-updated` union decodes and emerges on
 * [PreferencesSocketManager.conversationPreferencesUpdated]; the other two arms of
 * the SAME event name stay silent instead of throwing through a decoder that was
 * never meant for them.
 */
@RunWith(RobolectricTestRunner::class)
class PreferencesSocketManagerTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    private fun managerWithHandlers(): Pair<PreferencesSocketManager, Map<String, (Array<Any>) -> Unit>> {
        val socket: SocketManager = mockk(relaxed = true)
        val handlers = mutableMapOf<String, (Array<Any>) -> Unit>()
        every { socket.on(any(), any()) } answers {
            handlers[firstArg()] = secondArg()
        }
        val manager = PreferencesSocketManager(socket, json)
        manager.attach()
        return manager to handlers
    }

    private fun Map<String, (Array<Any>) -> Unit>.broadcast(raw: String) =
        getValue("user:preferences-updated").invoke(arrayOf(JSONObject(raw)))

    /** `writeConversationPreferences`'s own payload, copied key by key. */
    private val conversationScope = """
        {
          "userId": "u1", "conversationId": "c1", "version": 4, "reset": false,
          "preferences": {
            "isPinned": true, "isMuted": false, "mentionsOnly": false, "isArchived": false,
            "tags": ["work"], "categoryId": "cat-1", "orderInCategory": 3,
            "customName": "Sany", "reaction": null, "readingMode": "auto",
            "deletedForUserAt": null, "clearHistoryBefore": null
          }
        }
    """.trimIndent()

    @Test
    fun `a conversation-scope broadcast emits the decoded versioned snapshot`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        manager.conversationPreferencesUpdated.test {
            handlers.broadcast(conversationScope)

            val event = awaitItem()
            assertThat(event.conversationId).isEqualTo("c1")
            assertThat(event.version).isEqualTo(4)
            assertThat(event.reset).isFalse()
            assertThat(event.preferences?.isPinned).isTrue()
            assertThat(event.preferences?.categoryId).isEqualTo("cat-1")
            assertThat(event.preferences?.tags).containsExactly("work")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `a reset broadcast emits with no snapshot`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        manager.conversationPreferencesUpdated.test {
            handlers.broadcast("""{"userId":"u1","conversationId":"c1","version":5,"reset":true}""")

            val event = awaitItem()
            assertThat(event.reset).isTrue()
            assertThat(event.preferences).isNull()
            cancelAndIgnoreRemainingEvents()
        }
    }

    /**
     * The category arm of the union (`DELETE /me/preferences`, the four writers of
     * `me/preferences/{category}`). Feeding it to the conversation decoder would throw on
     * the missing `conversationId`, so the discriminant catches it first — and routes it
     * to its OWN flow rather than dropping it (#4133): it has a real Android reader.
     */
    @Test
    fun `the category scope never reaches the conversation stream`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        manager.conversationPreferencesUpdated.test {
            handlers.broadcast("""{"userId":"u1","category":"notification"}""")
            expectNoEvents()
        }
    }

    @Test
    fun `a category broadcast emits the category name`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        manager.categoryPreferencesUpdated.test {
            handlers.broadcast("""{"userId":"u1","category":"notification"}""")

            assertThat(awaitItem()).isEqualTo("notification")
            cancelAndIgnoreRemainingEvents()
        }
    }

    /**
     * `DELETE /me/preferences` (global reset) emits ONCE PER CATEGORY erased rather than a
     * single "everything" event — the contract is per category, and a nameless event would
     * fall into no branch. The bridge therefore has to relay each one, in order.
     */
    @Test
    fun `a global reset relays one event per erased category`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        manager.categoryPreferencesUpdated.test {
            handlers.broadcast("""{"userId":"u1","category":"privacy"}""")
            handlers.broadcast("""{"userId":"u1","category":"notification"}""")

            assertThat(awaitItem()).isEqualTo("privacy")
            assertThat(awaitItem()).isEqualTo("notification")
            cancelAndIgnoreRemainingEvents()
        }
    }

    /** A conversation-scope frame must not leak into the category stream. */
    @Test
    fun `the conversation scope never reaches the category stream`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        manager.categoryPreferencesUpdated.test {
            handlers.broadcast(conversationScope)
            expectNoEvents()
        }
    }

    /**
     * The community arm carries neither key, so it reaches neither stream — and that is
     * still correct: measured, nothing under `apps/android` caches a community-preference
     * row, so there is nothing on this device to go stale.
     */
    @Test
    fun `the community scope reaches neither stream`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        manager.categoryPreferencesUpdated.test {
            handlers.broadcast(
                """
                {
                  "userId":"u1","communityId":"comm-1","reset":false,
                  "preferences":{"isPinned":true,"isMuted":false,"isArchived":false,
                  "isHidden":false,"notificationLevel":"all","customName":null,
                  "categoryId":null,"orderInCategory":null}
                }
                """.trimIndent(),
            )
            expectNoEvents()
        }
    }

    @Test
    fun `a conversation-scope payload missing its version is dropped without crashing the callback`() =
        runTest {
            val (manager, handlers) = managerWithHandlers()
            manager.conversationPreferencesUpdated.test {
                handlers.broadcast("""{"userId":"u1","conversationId":"c1","reset":false}""")
                expectNoEvents()
            }
        }

    /**
     * `user:preferences-reordered` carries `orderInCategory` only, which no Android
     * surface reads (`ConversationSections.of` buckets on `isPinned` + `categoryId`).
     * Not listening to it is the decision, not an omission — this witness is what
     * makes the next reader notice they have to add the listener rather than assume
     * it is already there.
     */
    @Test
    fun `no reorder listener is registered`() {
        val (_, handlers) = managerWithHandlers()

        assertThat(handlers.keys).containsExactly("user:preferences-updated")
    }
}
